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
  startDate: z.string().optional().nullable(),
  est: z.coerce.number().int().min(0).default(30),
  impact: z.coerce.boolean().default(false),
  urgent: z.coerce.boolean().default(false),
  parentTaskId: z.string().uuid().optional().nullable(),
  groupId: z.string().uuid().optional().nullable()
});

/** Fila mínima devuelta al cliente tras crear una tarea/subtarea, para que
 * MondayBoard.tsx/QuickAddRow.tsx puedan insertarla de inmediato en el
 * estado local sin esperar una recarga completa de la página. */
export interface CreatedTaskRow {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: "High" | "Medium" | "Low";
  urgent: boolean;
  due: string | null;
  startDate: string | null;
  parentTaskId: string | null;
  groupId: string | null;
}

/**
 * FR-EXE-001/002 + subtareas (Monday-style, migración 0018) + Groups
 * (migración 0019, FASE 2 — retrofit de asignación de grupo, ver
 * MondayBoard.tsx §Groups):
 * - Si se envía parentTaskId, la tarea se crea como subtarea y SIEMPRE
 *   hereda el group_id de su padre (nunca el groupId explícito recibido),
 *   igual que setTaskParent en tree-actions.ts — un Subitem siempre vive
 *   visualmente dentro del mismo Group que su Item padre.
 * - Si es una tarea raíz y se envía groupId, se usa tal cual (viene del
 *   Group en el que el usuario dio clic en "+ Agregar tarea" dentro de
 *   MondayBoard).
 * - Si es una tarea raíz SIN groupId explícito (p. ej. flujos antiguos),
 *   se asigna automáticamente al primer Group del proyecto (por
 *   position), para que NINGUNA tarea nueva quede huérfana/sin grupo
 *   (gracias al backfill idempotente de la migración 0019, todo proyecto
 *   ya tiene al menos el grupo "General").
 */
export async function createTask(formData: FormData): Promise<CreatedTaskRow> {
  const parsed = taskSchema.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    priority: formData.get("priority") ?? "Medium",
    due: formData.get("due") || null,
    startDate: formData.get("startDate") || null,
    est: formData.get("est") ?? 30,
    impact: formData.get("impact") === "on",
    urgent: formData.get("urgent") === "on",
    parentTaskId: formData.get("parentTaskId") || null,
    groupId: formData.get("groupId") || null
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  let resolvedGroupId: string | null = parsed.groupId ?? null;

  if (parsed.parentTaskId) {
    // Subtarea: SIEMPRE hereda el group_id del padre, ignora cualquier
    // groupId explícito recibido.
    const { data: parentTask } = await supabase.from("tasks").select("group_id").eq("id", parsed.parentTaskId).single();
    resolvedGroupId = parentTask?.group_id ?? null;
  } else if (!resolvedGroupId) {
    // Tarea raíz sin grupo explícito: cae en el primer grupo del proyecto.
    const { data: firstGroup } = await supabase
      .from("task_groups")
      .select("id")
      .eq("project_id", parsed.projectId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    resolvedGroupId = firstGroup?.id ?? null;
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      project_id: parsed.projectId,
      title: parsed.title,
      priority: parsed.priority,
      due: parsed.due,
      start_date: parsed.startDate,
      est: parsed.est,
      impact: parsed.impact,
      urgent: parsed.urgent,
      parent_task_id: parsed.parentTaskId,
      group_id: resolvedGroupId
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("task_history").insert({ task_id: task.id, from_state: null, to_state: "Pending" });
  await supabase
    .from("audit_log")
    .insert({ user_id: user.id, action: parsed.parentTaskId ? "task.subtask.create" : "task.create", object: task.id });
  revalidatePath("/execution");

  return {
    id: task.id,
    projectId: task.project_id,
    title: task.title,
    status: task.status as TaskStatus,
    priority: task.priority as "High" | "Medium" | "Low",
    urgent: task.urgent,
    due: task.due,
    startDate: task.start_date ?? null,
    parentTaskId: task.parent_task_id ?? null,
    groupId: task.group_id ?? null
  };
}

/** Renombrado inline del título (edición directa en la fila del tablero). */
export async function renameTask(taskId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("version").eq("id", taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  const { error } = await supabase.from("tasks").update({ title: trimmed, version: task.version + 1 }).eq("id", taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.rename", object: taskId });
  revalidatePath("/execution");
}

/** Columna "Timeline" (migración 0018): actualiza el rango start_date/due de una tarea. */
export async function updateTaskDates(taskId: string, startDate: string | null, due: string | null) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("version").eq("id", taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  const { error } = await supabase.from("tasks").update({ start_date: startDate, due, version: task.version + 1 }).eq("id", taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.dates", object: taskId, meta: { startDate, due } });
  revalidatePath("/execution");
  revalidatePath("/home");
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
 * applyProjectSequence.
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
