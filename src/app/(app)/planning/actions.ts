"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";

const planSchema = z.object({
  projectId: z.string().uuid().optional().or(z.literal("")),
  oneThingTaskId: z.string().uuid(),
  impactTaskIds: z.array(z.string().uuid()).max(3)
});

/** FR-PLN-002/008: primero proyecto, luego tarea (Única Cosa). Máximo 3 de impacto. */
export async function approveDailyPlan(formData: FormData) {
  const parsed = planSchema.parse({
    projectId: formData.get("projectId") ?? "",
    oneThingTaskId: formData.get("oneThingTaskId"),
    impactTaskIds: formData.getAll("impactTaskIds")
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: oneTask, error: oneTaskErr } = await supabase.from("tasks").select("id, title").eq("id", parsed.oneThingTaskId).single();
  if (oneTaskErr || !oneTask) throw new Error("Selecciona una tarea válida para tu Única Cosa");

  const ids = Array.from(new Set([oneTask.id, ...parsed.impactTaskIds])).slice(0, 3);
  const t0 = todayLocal(await getUserTimeZone());

  const { error: upsertErr } = await supabase.from("daily_plans").upsert(
    {
      user_id: user.id,
      local_date: t0,
      one_thing: oneTask.title,
      one_thing_task_id: oneTask.id,
      one_thing_project_id: parsed.projectId || null,
      task_ids: ids,
      approved: true,
      approved_at: new Date().toISOString()
    },
    { onConflict: "user_id,local_date" }
  );
  if (upsertErr) throw new Error(upsertErr.message);

  await supabase.from("tasks").update({ impact: false }).neq("id", "00000000-0000-0000-0000-000000000000");
  if (ids.length) await supabase.from("tasks").update({ impact: true }).in("id", ids);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "dailyplan.approve",
    object: t0,
    meta: { project: parsed.projectId || "all", task: oneTask.id }
  });

  revalidatePath("/planning");
  revalidatePath("/home");
}

const closeoutSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["Completed", "Rescheduled", "Blocked"])
});

/** FR-PLN-004: cierre diario — completado, reprogramado, bloqueos y aprendizaje. */
export async function closeoutTask(formData: FormData) {
  const parsed = closeoutSchema.parse({
    taskId: formData.get("taskId"),
    status: formData.get("status")
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("status, version").eq("id", parsed.taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  const { error } = await supabase
    .from("tasks")
    .update({
      status: parsed.status,
      completed_at: parsed.status === "Completed" ? new Date().toISOString() : null,
      version: task.version + 1
    })
    .eq("id", parsed.taskId);
  if (error) throw new Error(error.message);

  await supabase.from("task_history").insert({ task_id: parsed.taskId, from_state: task.status, to_state: parsed.status });

  await supabase.from("audit_log").insert({ user_id: user.id, action: "day.closeout", object: parsed.taskId });
  revalidatePath("/planning");
  revalidatePath("/home");
}

/** FR-PLN-004: guarda el aprendizaje del cierre diario en la bitácora, sin acoplarlo al estado de ninguna tarea específica. */
export async function saveDailyLearning(text: string) {
  if (!text.trim()) return;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  await supabase.from("logbook").insert({ user_id: user.id, type: "learning", text: text.trim() });
  await supabase.from("audit_log").insert({ user_id: user.id, action: "day.closeout.learning" });
  revalidatePath("/execution");
}

/** FR-PLN-005, BR-004: la revisión semanal produce un snapshot APROBADO E INMUTABLE. */
export async function approveWeeklyReview() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: tasks } = await supabase.from("tasks").select("id, status, project_id");
  const { data: projects } = await supabase.from("projects").select("id").eq("status", "Active");

  const completed = (tasks ?? []).filter((t) => t.status === "Completed").length;
  const blocked = (tasks ?? []).filter((t) => t.status === "Blocked").length;

  const activeProjectIds = new Set((projects ?? []).map((p) => p.id));
  const activeTasks = (tasks ?? []).filter((t) => activeProjectIds.has(t.project_id) && t.status !== "Cancelled");
  const progress = activeTasks.length ? Math.round((activeTasks.filter((t) => t.status === "Completed").length / activeTasks.length) * 100) : 0;

  const { error } = await supabase.from("weekly_reviews").insert({
    user_id: user.id,
    completed_count: completed,
    progress_pct: progress,
    blocked_count: blocked
  });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "weekly.review" });
  revalidatePath("/planning");
}
