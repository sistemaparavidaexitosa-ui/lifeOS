"use server";
// FASE 4 (Tree View). Server Actions para reparentar tareas (drag&drop en
// el árbol), mover tareas entre Groups, CRUD de task_groups (migración
// 0019_execution_groups_folders.sql, Fase 2), y cambio de estado desde el
// StatusMenu embebido en cada nodo del árbol. Reutiliza has_project_access/
// can_edit_project vía RLS — ninguna Action valida permisos aquí, RLS lo
// hace en la base de datos (mismo patrón que task-detail-actions.ts).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/lib/domain/types.ts";

const setParentSchema = z.object({
  taskId: z.string().uuid(),
  parentTaskId: z.string().uuid().nullable()
});

/**
 * Reparenta una tarea (drag&drop en el Tree View). La validación de "no
 * convertir un ancestro en su propio descendiente" debe hacerse en el
 * CLIENTE antes de llamar esta Action, usando isDescendant() de
 * src/lib/domain/task-tree.ts (evita un round-trip innecesario). Aun así,
 * esta Action es defensiva: si parentTaskId === taskId, la rechaza.
 */
export async function setTaskParent(taskId: string, parentTaskId: string | null) {
  const parsed = setParentSchema.parse({ taskId, parentTaskId });
  if (parsed.parentTaskId === parsed.taskId) {
    throw new Error("Una tarea no puede ser su propio padre");
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("version, project_id").eq("id", parsed.taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  // Si se reparenta bajo otra tarea, hereda su group_id (mantiene el
  // Subitem visualmente dentro del mismo Group que su nuevo padre).
  let nextGroupId: string | null | undefined = undefined;
  if (parsed.parentTaskId) {
    const { data: parentTask } = await supabase.from("tasks").select("group_id").eq("id", parsed.parentTaskId).single();
    nextGroupId = parentTask?.group_id ?? null;
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      parent_task_id: parsed.parentTaskId,
      ...(nextGroupId !== undefined ? { group_id: nextGroupId } : {}),
      version: task.version + 1
    })
    .eq("id", parsed.taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "task.reparent",
    object: parsed.taskId,
    meta: { parentTaskId: parsed.parentTaskId }
  });
  revalidatePath("/execution");
}

const setGroupSchema = z.object({
  taskId: z.string().uuid(),
  groupId: z.string().uuid()
});

/** Mueve una tarea (o Subitem raíz) a otro Group dentro del mismo Board. */
export async function setTaskGroup(taskId: string, groupId: string) {
  const parsed = setGroupSchema.parse({ taskId, groupId });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("version").eq("id", parsed.taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  const { error } = await supabase
    .from("tasks")
    .update({ group_id: parsed.groupId, version: task.version + 1 })
    .eq("id", parsed.taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.group.move", object: parsed.taskId, meta: { groupId: parsed.groupId } });
  revalidatePath("/execution");
}

const statusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["Not Started", "In Progress", "Blocked", "Completed", "Cancelled"])
});

/**
 * Cambia el estado de una tarea desde el StatusMenu embebido en un nodo del
 * Tree View. Sigue el MISMO patrón que updateTaskDetails en
 * task-detail-actions.ts (version increment) y además registra la
 * transición en task_history — igual que el resto del proyecto hace en
 * cualquier cambio de status (ver comentario en TreeItemNode.tsx).
 *
 * NOTA: si tu enum real de TaskStatus (src/lib/domain/types.ts) usa otros
 * literales distintos a los de arriba, ajusta el z.enum() aquí para que
 * coincida exactamente — Zod rechazará cualquier valor fuera de esa lista.
 */
export async function updateTaskStatusFromTree(taskId: string, status: TaskStatus) {
  const parsed = statusSchema.parse({ taskId, status });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("version, status").eq("id", parsed.taskId).single();
  if (!task) throw new Error("Tarea no encontrada");
  if (task.status === parsed.status) return;

  const { error } = await supabase
    .from("tasks")
    .update({ status: parsed.status, version: task.version + 1 })
    .eq("id", parsed.taskId);
  if (error) throw new Error(error.message);

  await supabase.from("task_history").insert({ task_id: parsed.taskId, from_state: task.status, to_state: parsed.status });
  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.status", object: parsed.taskId, meta: { from: task.status, to: parsed.status } });
  revalidatePath("/execution");
}

const createGroupSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(120),
  color: z.string().min(1).default("var(--c-purple)")
});

export async function createTaskGroup(input: { projectId: string; name: string; color?: string }) {
  const parsed = createGroupSchema.parse(input);

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { count } = await supabase
    .from("task_groups")
    .select("id", { count: "exact", head: true })
    .eq("project_id", parsed.projectId);

  const { data, error } = await supabase
    .from("task_groups")
    .insert({ project_id: parsed.projectId, name: parsed.name.trim(), color: parsed.color, position: count ?? 0 })
    .select("id, name, color, position")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "group.create", object: data.id, meta: { name: parsed.name } });
  revalidatePath("/execution");
  return data;
}

const renameGroupSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().min(1).max(120)
});

export async function renameTaskGroup(groupId: string, name: string) {
  const parsed = renameGroupSchema.parse({ groupId, name });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("task_groups").update({ name: parsed.name.trim() }).eq("id", parsed.groupId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "group.rename", object: parsed.groupId });
  revalidatePath("/execution");
}

const deleteGroupSchema = z.object({
  groupId: z.string().uuid(),
  fallbackGroupId: z.string().uuid()
});

/**
 * Elimina un Group. Las tareas dentro de él se reasignan PRIMERO al
 * fallbackGroupId (nunca se dejan huérfanas con group_id null) — misma
 * filosofía del backfill idempotente de la migración 0019. El caller debe
 * pasar el id de otro Group del mismo proyecto (típicamente "General").
 */
export async function deleteTaskGroup(groupId: string, fallbackGroupId: string) {
  const parsed = deleteGroupSchema.parse({ groupId, fallbackGroupId });
  if (parsed.groupId === parsed.fallbackGroupId) {
    throw new Error("El grupo de destino debe ser diferente al que se elimina");
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error: moveErr } = await supabase
    .from("tasks")
    .update({ group_id: parsed.fallbackGroupId })
    .eq("group_id", parsed.groupId);
  if (moveErr) throw new Error(moveErr.message);

  const { error: delErr } = await supabase.from("task_groups").delete().eq("id", parsed.groupId);
  if (delErr) throw new Error(delErr.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "group.delete", object: parsed.groupId, meta: { fallbackGroupId: parsed.fallbackGroupId } });
  revalidatePath("/execution");
}
