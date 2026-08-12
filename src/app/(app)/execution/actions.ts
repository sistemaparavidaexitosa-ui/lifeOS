"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { evaluateTransition } from "@/lib/domain/task-state.ts";
import { suggestProjectSequence } from "@/lib/domain/project-sequence.ts";
import type { TaskStatus } from "@/lib/domain/types.ts";

const projectSchema = z.object({
  title: z.string().min(1),
  objective: z.string().optional().default(""),
  status: z.enum(["Draft", "Active", "OnHold", "Completed", "Cancelled", "Archived"]).default("Active"),
  priority: z.enum(["High", "Medium", "Low"]).default("Medium"),
  targetDate: z.string().optional().nullable()
});

export async function createProject(formData: FormData) {
  const parsed = projectSchema.parse({
    title: formData.get("title"),
    objective: formData.get("objective") ?? "",
    status: formData.get("status") ?? "Active",
    priority: formData.get("priority") ?? "Medium",
    targetDate: formData.get("targetDate") || null
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("projects").insert({
    owner_id: user.id,
    title: parsed.title,
    objective: parsed.objective,
    status: parsed.status,
    priority: parsed.priority,
    target_date: parsed.targetDate,
    owner_name: user.email ?? ""
  });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "project.create", object: parsed.title });
  revalidatePath("/execution");
}

const taskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  priority: z.enum(["High", "Medium", "Low"]).default("Medium"),
  due: z.string().optional().nullable(),
  est: z.coerce.number().int().min(0).default(30),
  impact: z.coerce.boolean().default(false),
  urgent: z.coerce.boolean().default(false)
});

export async function createTask(formData: FormData) {
  const parsed = taskSchema.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    priority: formData.get("priority") ?? "Medium",
    due: formData.get("due") || null,
    est: formData.get("est") ?? 30,
    impact: formData.get("impact") === "on",
    urgent: formData.get("urgent") === "on"
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      project_id: parsed.projectId,
      title: parsed.title,
      priority: parsed.priority,
      due: parsed.due,
      est: parsed.est,
      impact: parsed.impact,
      urgent: parsed.urgent
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("task_history").insert({ task_id: task.id, from_state: null, to_state: "Pending" });
  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.create", object: task.id });
  revalidatePath("/execution");
}

/** FR-EXE-003/004/005: aplica la máquina de estados con validación real de dependencias. */
export async function setTaskStatus(taskId: string, to: TaskStatus) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task, error: taskErr } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (taskErr || !task) throw new Error("Tarea no encontrada");

  let depStatuses: Record<string, TaskStatus> = {};
  if (task.deps?.length) {
    const { data: deps } = await supabase.from("tasks").select("id, status").in("id", task.deps);
    depStatuses = Object.fromEntries((deps ?? []).map((d) => [d.id, d.status as TaskStatus]));
  }

  const result = evaluateTransition({ status: task.status as TaskStatus, deps: task.deps ?? [] }, to, depStatuses);
  if (!result.ok) throw new Error(result.message ?? "Transición no permitida");

  const { error } = await supabase
    .from("tasks")
    .update({ status: to, completed_at: to === "Completed" ? new Date().toISOString() : null, version: task.version + 1 })
    .eq("id", taskId);
  if (error) throw new Error(error.message);

  await supabase.from("task_history").insert({ task_id: taskId, from_state: task.status, to_state: to });
  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.status", object: taskId, meta: { to } });
  revalidatePath("/execution");
  revalidatePath("/home");
}

/**
 * FR-INT-011, BR-022: heurística determinista de secuenciación. Devuelve la
 * sugerencia SIN aplicarla; requiere confirmación explícita del usuario vía
 * `applyProjectSequence`.
 */
export async function requestProjectSequence(projectId: string) {
  const supabase = await createClient();
  const { data: tasks } = await supabase.from("tasks").select("id, status, priority, est, deps").eq("project_id", projectId);
  const suggestion = suggestProjectSequence(
    (tasks ?? []).map((t) => ({ id: t.id, status: t.status as TaskStatus, priority: t.priority as "High" | "Medium" | "Low", est: t.est, deps: t.deps ?? [] }))
  );
  return suggestion;
}

/** BR-022, FR-INT-008: solo se llama tras la confirmación EXPLÍCITA del usuario. */
export async function applyProjectSequence(projectId: string, order: string[]) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  await supabase.from("audit_log").insert({ user_id: user.id, action: "project.sequence.apply", object: projectId, meta: { order } });
  revalidatePath("/execution");
}
