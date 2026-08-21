"use server";
// Server Actions del rediseño de flujo estilo monday.com / ClickUp:
// orden manual (drag&drop), prioridad inline, color/orden de grupos y
// acciones masivas sobre una selección de tareas.
//
// Reglas que se respetan aquí (mismas del resto del módulo):
//   - Ninguna Action valida permisos a mano: RLS (has_project_access /
//     can_edit_project) lo hace en la base, igual que actions.ts y
//     tree-actions.ts.
//   - Los cambios de ESTADO pasan SIEMPRE por evaluateTransition
//     (FR-EXE-003/004/005) — incluido el cambio masivo, que valida tarea por
//     tarea y devuelve los rechazos en vez de forzarlos.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { evaluateTransition } from "@/lib/domain/task-state.ts";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";

const idListSchema = z.array(z.string().uuid()).min(1).max(500);

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Orden manual (migración 0021: tasks.position)
// ---------------------------------------------------------------------------

const reorderSchema = z.object({
  projectId: z.string().uuid(),
  orderedIds: idListSchema
});

/**
 * Reasigna position = 0..N-1 a una lista de HERMANOS (tareas raíz de un
 * grupo, o subtareas de un mismo padre). El cliente manda el arreglo
 * completo que calculó con reorderIds() de src/lib/domain/board.ts, así que
 * el orden optimista del cliente y el persistido son idénticos por
 * construcción.
 *
 * No incrementa `version`: position es orden de presentación, no contenido
 * de la tarea, y bumpearlo obligaría a un SELECT extra por fila en cada
 * arrastre.
 */
export async function reorderTasks(projectId: string, orderedIds: string[]) {
  const parsed = reorderSchema.parse({ projectId, orderedIds });
  const { supabase, user } = await requireUser();

  const results = await Promise.all(
    parsed.orderedIds.map((id, index) =>
      supabase.from("tasks").update({ position: index }).eq("id", id).eq("project_id", parsed.projectId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "task.reorder",
    object: parsed.projectId,
    meta: { count: parsed.orderedIds.length }
  });
  revalidatePath("/execution");
}

const moveSchema = z.object({
  taskId: z.string().uuid(),
  groupId: z.string().uuid(),
  projectId: z.string().uuid(),
  orderedIds: idListSchema
});

/**
 * Mueve una tarea a otro grupo Y fija el orden de la lista destino en una
 * sola llamada (arrastre entre grupos del tablero). Como la tarea deja de
 * ser subtarea al soltarse en la raíz de un grupo, también limpia
 * parent_task_id.
 */
export async function moveTaskToGroup(input: { taskId: string; groupId: string; projectId: string; orderedIds: string[] }) {
  const parsed = moveSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { data: task } = await supabase.from("tasks").select("version").eq("id", parsed.taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  const { error } = await supabase
    .from("tasks")
    .update({ group_id: parsed.groupId, parent_task_id: null, version: task.version + 1 })
    .eq("id", parsed.taskId);
  if (error) throw new Error(error.message);

  const results = await Promise.all(
    parsed.orderedIds.map((id, index) =>
      supabase.from("tasks").update({ position: index }).eq("id", id).eq("project_id", parsed.projectId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "task.group.move",
    object: parsed.taskId,
    meta: { groupId: parsed.groupId }
  });
  revalidatePath("/execution");
}

const reorderGroupsSchema = z.object({
  projectId: z.string().uuid(),
  orderedIds: idListSchema
});

export async function reorderGroups(projectId: string, orderedIds: string[]) {
  const parsed = reorderGroupsSchema.parse({ projectId, orderedIds });
  const { supabase, user } = await requireUser();

  const results = await Promise.all(
    parsed.orderedIds.map((id, index) =>
      supabase.from("task_groups").update({ position: index }).eq("id", id).eq("project_id", parsed.projectId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "group.reorder", object: parsed.projectId });
  revalidatePath("/execution");
}

const groupColorSchema = z.object({
  groupId: z.string().uuid(),
  color: z.string().min(1).max(60)
});

/** Color de la barra del grupo (token CSS, p. ej. `var(--c-green)`). */
export async function setGroupColor(groupId: string, color: string) {
  const parsed = groupColorSchema.parse({ groupId, color });
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("task_groups").update({ color: parsed.color }).eq("id", parsed.groupId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "group.color", object: parsed.groupId, meta: { color: parsed.color } });
  revalidatePath("/execution");
}

// ---------------------------------------------------------------------------
// Prioridad / urgencia inline (columna "Prioridad" del tablero)
// ---------------------------------------------------------------------------

const prioritySchema = z.object({
  taskId: z.string().uuid(),
  priority: z.enum(["High", "Medium", "Low"]),
  urgent: z.boolean()
});

/**
 * Prioridad + urgencia en una sola escritura. Ambas alimentan la matriz
 * Eisenhower (quadrantOf en src/lib/domain/eisenhower.ts), por eso se
 * revalida también /execution/eisenhower.
 */
export async function setTaskPriority(taskId: string, priority: Priority, urgent: boolean) {
  const parsed = prioritySchema.parse({ taskId, priority, urgent });
  const { supabase, user } = await requireUser();

  const { data: task } = await supabase.from("tasks").select("version").eq("id", parsed.taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  const { error } = await supabase
    .from("tasks")
    .update({ priority: parsed.priority, urgent: parsed.urgent, version: task.version + 1 })
    .eq("id", parsed.taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "task.priority",
    object: parsed.taskId,
    meta: { priority: parsed.priority, urgent: parsed.urgent }
  });
  revalidatePath("/execution");
  revalidatePath("/execution/eisenhower");
}

// ---------------------------------------------------------------------------
// Acciones masivas (barra de selección estilo monday/ClickUp)
// ---------------------------------------------------------------------------

export interface BulkResult {
  updated: string[];
  failures: { id: string; message: string }[];
}

const bulkStatusSchema = z.object({
  ids: idListSchema,
  status: z.enum(["Pending", "InProgress", "Blocked", "Rescheduled", "Completed", "Cancelled"])
});

/**
 * Cambia el estado de varias tareas. Valida CADA transición con la misma
 * máquina de estados que StatusMenu/Kanban (evaluateTransition), incluida la
 * regla de dependencias abiertas (BR-014/FR-EXE-005): las tareas que no
 * pueden moverse se devuelven en `failures` y el resto sí se aplica — nunca
 * se fuerza una transición inválida ni se aborta todo por una tarea.
 */
export async function bulkSetTaskStatus(ids: string[], status: TaskStatus): Promise<BulkResult> {
  const parsed = bulkStatusSchema.parse({ ids, status });
  const { supabase, user } = await requireUser();

  const { data: tasks, error: readErr } = await supabase.from("tasks").select("id, title, status, deps, version").in("id", parsed.ids);
  if (readErr) throw new Error(readErr.message);

  const depIds = [...new Set((tasks ?? []).flatMap((t) => t.deps ?? []))];
  let depStatuses: Record<string, TaskStatus> = {};
  if (depIds.length) {
    const { data: deps } = await supabase.from("tasks").select("id, status").in("id", depIds);
    depStatuses = Object.fromEntries((deps ?? []).map((d) => [d.id, d.status as TaskStatus]));
  }

  const result: BulkResult = { updated: [], failures: [] };
  for (const task of tasks ?? []) {
    if (task.status === parsed.status) continue;
    const check = evaluateTransition({ status: task.status as TaskStatus, deps: task.deps ?? [] }, parsed.status, depStatuses);
    if (!check.ok) {
      result.failures.push({ id: task.id, message: `${task.title}: ${check.message ?? "transición no permitida"}` });
      continue;
    }
    const { error } = await supabase
      .from("tasks")
      .update({
        status: parsed.status,
        completed_at: parsed.status === "Completed" ? new Date().toISOString() : null,
        version: task.version + 1
      })
      .eq("id", task.id);
    if (error) {
      result.failures.push({ id: task.id, message: `${task.title}: ${error.message}` });
      continue;
    }
    await supabase.from("task_history").insert({ task_id: task.id, from_state: task.status, to_state: parsed.status });
    result.updated.push(task.id);
  }

  if (result.updated.length) {
    await supabase.from("audit_log").insert({
      user_id: user.id,
      action: "task.status.bulk",
      object: result.updated.join(","),
      meta: { to: parsed.status, count: result.updated.length }
    });
    revalidatePath("/execution");
    revalidatePath("/home");
  }
  return result;
}

const bulkGroupSchema = z.object({
  ids: idListSchema,
  groupId: z.string().uuid()
});

/** Mueve varias tareas a un grupo. Las subtareas seleccionadas se promueven a raíz. */
export async function bulkMoveToGroup(ids: string[], groupId: string) {
  const parsed = bulkGroupSchema.parse({ ids, groupId });
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("tasks")
    .update({ group_id: parsed.groupId, parent_task_id: null })
    .in("id", parsed.ids);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "task.group.move.bulk",
    object: parsed.groupId,
    meta: { count: parsed.ids.length }
  });
  revalidatePath("/execution");
}

/** Borra varias tareas. Las subtareas caen por ON DELETE CASCADE (migración 0018). */
export async function bulkDeleteTasks(ids: string[]) {
  const parsed = idListSchema.parse(ids);
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("tasks").delete().in("id", parsed);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "task.delete.bulk",
    object: parsed.join(","),
    meta: { count: parsed.length }
  });
  revalidatePath("/execution");
  revalidatePath("/home");
}
