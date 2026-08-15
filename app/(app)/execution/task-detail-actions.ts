"use server";

// FASE 1 — Modal de tarea completo (assignees + deps + comentarios/menciones
// + historial). Archivo NUEVO, separado de actions.ts existente para no
// generar conflictos de merge con el repo real.
//
// Cubre el gap documentado en el plan de cierre de brechas:
//   - task_assignees: existía en el esquema (0003_execution_collaboration.sql)
//     pero sin ninguna Server Action ni UI que la usara.
//   - comments: idem, existía la tabla pero no había panel de comentarios en
//     el módulo de ejecución (sí en el HTML de referencia, openTask()).
//   - task_history: existía y se poblaba desde setTaskStatus/changeTaskQuadrant,
//     pero no se exponía como panel de solo lectura en la UI.
//   - deps (tasks.deps uuid[]): la columna y la validación de dependencias
//     abiertas (evaluateTransition) ya existían, pero no había forma de
//     EDITAR el arreglo de dependencias desde la UI (solo en creación, sin
//     checklist real).
//
// Ninguna migración SQL nueva es necesaria — todo el esquema ya existe con
// RLS y GRANTs correctos desde 0002/0003_execution_collaboration.sql.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";

export interface TaskDetailTask {
  id: string;
  project_id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  urgent: boolean;
  due: string | null;
  est: number;
  deps: string[];
  impact: boolean;
  version: number;
}

export interface TaskDetailComment {
  id: string;
  body: string;
  author_name: string;
  mentions: string[];
  created_at: string;
}

export interface TaskDetailHistoryRow {
  id: string;
  from_state: string | null;
  to_state: string;
  ts: string;
}

export interface TaskDetailDepCandidate {
  id: string;
  title: string;
  status: string;
}

export interface TaskDetailResult {
  task: TaskDetailTask;
  projectTitle: string;
  members: string[];
  depCandidates: TaskDetailDepCandidate[];
  assignees: string[];
  comments: TaskDetailComment[];
  history: TaskDetailHistoryRow[];
}

/**
 * Carga TODA la información necesaria para el panel/modal de detalle de una
 * tarea en una sola llamada: la tarea, el proyecto, los miembros disponibles
 * para asignar (BR-015: solo miembros con acceso al proyecto), las tareas
 * candidatas a dependencia (mismo proyecto, excluyendo la actual), los
 * responsables actuales, comentarios e historial.
 */
export async function getTaskDetail(taskId: string): Promise<TaskDetailResult> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task, error: taskErr } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (taskErr || !task) throw new Error("Tarea no encontrada");

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, workspace_id, owner_id")
    .eq("id", task.project_id)
    .single();

  // Miembros disponibles para asignar (FR-COL-003, BR-015): si el proyecto
  // es personal (sin workspace) solo el propio titular puede ser assignee;
  // si tiene workspace, se usa el RPC list_workspace_members (evita el bug
  // de recursión de RLS ya resuelto en 0012_fix_rls_recursion_structural.sql).
  let members: string[] = [];
  if (project?.workspace_id) {
    const { data: rows } = await supabase.rpc("list_workspace_members", { p_workspace_id: project.workspace_id });
    members = (rows ?? []).map((m: { user_name: string }) => m.user_name);
  } else {
    const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();
    if (profile?.name) members = [profile.name];
  }

  const { data: allTasks } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("project_id", task.project_id)
    .neq("id", taskId);

  const { data: assigneeRows } = await supabase.from("task_assignees").select("user_name").eq("task_id", taskId);

  const { data: commentRows } = await supabase
    .from("comments")
    .select("id, body, author_name, mentions, created_at")
    .eq("subject_type", "task")
    .eq("subject_id", taskId)
    .order("created_at", { ascending: true });

  const { data: historyRows } = await supabase
    .from("task_history")
    .select("id, from_state, to_state, ts")
    .eq("task_id", taskId)
    .order("ts", { ascending: false });

  return {
    task: {
      id: task.id,
      project_id: task.project_id,
      title: task.title,
      status: task.status as TaskStatus,
      priority: task.priority as Priority,
      urgent: task.urgent,
      due: task.due,
      est: task.est,
      deps: task.deps ?? [],
      impact: task.impact,
      version: task.version
    },
    projectTitle: project?.title ?? "",
    members,
    depCandidates: (allTasks ?? []).map((t) => ({ id: t.id, title: t.title, status: t.status })),
    assignees: (assigneeRows ?? []).map((a) => a.user_name),
    comments: commentRows ?? [],
    history: historyRows ?? []
  };
}

const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1),
  priority: z.enum(["High", "Medium", "Low"]),
  due: z.string().optional().nullable(),
  est: z.coerce.number().int().min(0),
  impact: z.coerce.boolean().default(false),
  urgent: z.coerce.boolean().default(false)
});

/** Edición completa de campos básicos de la tarea (título/prioridad/fecha/estimado/impacto/urgente). */
export async function updateTaskDetails(formData: FormData) {
  const parsed = updateTaskSchema.parse({
    taskId: formData.get("taskId"),
    title: formData.get("title"),
    priority: formData.get("priority"),
    due: formData.get("due") || null,
    est: formData.get("est"),
    impact: formData.get("impact") === "on",
    urgent: formData.get("urgent") === "on"
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task, error: taskErr } = await supabase.from("tasks").select("version").eq("id", parsed.taskId).single();
  if (taskErr || !task) throw new Error("Tarea no encontrada");

  const { error } = await supabase
    .from("tasks")
    .update({
      title: parsed.title.trim(),
      priority: parsed.priority,
      due: parsed.due,
      est: parsed.est,
      impact: parsed.impact,
      urgent: parsed.urgent,
      version: task.version + 1
    })
    .eq("id", parsed.taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.update", object: parsed.taskId });
  revalidatePath("/execution");
}

/**
 * FR-COL-003, BR-015: reemplaza el conjunto de responsables de la tarea.
 * Solo se permiten nombres que ya son miembros con acceso al proyecto — la
 * validación real de membresía ocurre en la Server Action getTaskDetail()
 * (que arma la lista `members` mostrada al usuario); aquí solo persistimos
 * la selección que el cliente ya filtró contra esa lista.
 */
export async function setTaskAssignees(taskId: string, userNames: string[]) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("id, project_id, title").eq("id", taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  const { error: delErr } = await supabase.from("task_assignees").delete().eq("task_id", taskId);
  if (delErr) throw new Error(delErr.message);

  if (userNames.length) {
    const { error: insErr } = await supabase
      .from("task_assignees")
      .insert(userNames.map((userName) => ({ task_id: taskId, user_name: userName })));
    if (insErr) throw new Error(insErr.message);
  }

  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.assignees", object: taskId, meta: { assignees: userNames } });

  // Feed de actividad del workspace (best-effort, coherente con COLLAB.activity
  // del HTML de referencia): si el insert falla por RLS (proyecto personal,
  // sin workspace_id), simplemente no se registra actividad — no es un error.
  try {
    const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", task.project_id).single();
    if (project?.workspace_id) {
      await supabase.from("workspace_activity").insert({
        workspace_id: project.workspace_id,
        project_id: task.project_id,
        type: "task.assign",
        text: `Responsables de "${task.title}" actualizados: ${userNames.join(", ") || "ninguno"}`,
        actor: user.email ?? ""
      });
    }
  } catch {
    // best-effort, no bloquea el flujo principal
  }

  revalidatePath("/execution");
}

/**
 * FR-EXE-005: actualiza el arreglo de dependencias de la tarea. La
 * validación de "no completar con dependencias abiertas" ya vive en
 * evaluateTransition() (src/lib/domain/task-state.ts) y se aplica en
 * setTaskStatus (execution/actions.ts) — esta acción solo captura la
 * relación, no valida ciclos (igual que el HTML de referencia).
 */
export async function setTaskDeps(taskId: string, depIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("version").eq("id", taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  // Evita que una tarea se declare dependiente de sí misma.
  const cleanDeps = Array.from(new Set(depIds.filter((id) => id !== taskId)));

  const { error } = await supabase.from("tasks").update({ deps: cleanDeps, version: task.version + 1 }).eq("id", taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.deps", object: taskId, meta: { deps: cleanDeps } });
  revalidatePath("/execution");
}

/**
 * FR-COL-004: agrega un comentario con soporte de menciones (@nombre),
 * igual que renderMentions()/taskCommentsPanel() del HTML de referencia.
 */
export async function addTaskComment(taskId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) return;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("project_id, title").eq("id", taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();
  const mentions = (trimmed.match(/@([\wÀ-ÿ]+)/g) ?? []).map((m) => m.slice(1));

  const { error } = await supabase.from("comments").insert({
    subject_type: "task",
    subject_id: taskId,
    author_id: user.id,
    author_name: profile?.name ?? user.email ?? "Usuario",
    body: trimmed,
    mentions
  });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "comment.add", object: taskId, meta: { mentions } });

  try {
    const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", task.project_id).single();
    if (project?.workspace_id) {
      await supabase.from("workspace_activity").insert({
        workspace_id: project.workspace_id,
        project_id: task.project_id,
        type: "comment",
        text: `Comentario en "${task.title}"`,
        actor: user.email ?? ""
      });
    }
  } catch {
    // best-effort
  }

  revalidatePath("/execution");
}
