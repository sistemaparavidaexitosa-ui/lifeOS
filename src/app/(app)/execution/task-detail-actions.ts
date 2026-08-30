"use server";
// Server Actions del modal de tarea completo (assignees + deps + comentarios
// + historial + descripción + archivos). Reutiliza el esquema ya existente
// (task_assignees, comments, task_history) y las extensiones de Fase 2/3
// (tasks.description, task_files) — sin duplicar ninguna tabla.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseMentions, type RosterMember } from "@/lib/domain/execution/mentions.ts";
import { dispatchAutomations } from "@/lib/automations/dispatch";
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
  description: string;
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

export interface TaskDetailReaction {
  comment_id: string;
  user_id: string;
  emoji: string;
}

export interface TaskDetailDepCandidate {
  id: string;
  title: string;
  status: string;
}

/** FASE 3 (Drawer — Archivos): metadato de un archivo adjunto a la tarea. */
export interface TaskDetailFile {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  content_type: string;
  created_at: string;
}

export interface TaskDetailResult {
  task: TaskDetailTask;
  projectTitle: string;
  members: string[];
  /** El mismo roster, con id. Lo necesita el selector de menciones. */
  roster: RosterMember[];
  depCandidates: TaskDetailDepCandidate[];
  assignees: string[];
  comments: TaskDetailComment[];
  history: TaskDetailHistoryRow[];
  /** Reacciones de TODOS los comentarios de la tarea, en una sola consulta. */
  reactions: TaskDetailReaction[];
  /** Quién mira. Lo necesita el hilo para saber qué reacciones son suyas. */
  viewerId: string;
  files: TaskDetailFile[];
}

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

  // El roster se carga UNA vez y sirve a dos cosas: el selector de responsables
  // (solo nombres, como siempre) y el de menciones, que necesita el id — sin él
  // la mención vuelve a ser un nombre suelto y la bandeja no sabe a quién avisar.
  let roster: RosterMember[] = [];
  if (project?.workspace_id) {
    const { data: rows } = await supabase.rpc("list_workspace_members", { p_workspace_id: project.workspace_id });
    roster = (rows ?? []).map((m: { user_id: string; user_name: string }) => ({ userId: m.user_id, name: m.user_name }));
  }
  if (!roster.length) {
    // Red de seguridad para una cuenta anterior a 0030 sin membresía Owner:
    // sin esto no podría mencionarse ni a sí misma.
    const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();
    if (profile?.name) roster = [{ userId: user.id, name: profile.name }];
  }
  const members: string[] = roster.map((m) => m.name);

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

  // Una sola consulta para las reacciones de TODOS los comentarios: una por
  // comentario sería N+1 en un hilo largo.
  const commentIds = (commentRows ?? []).map((c) => c.id);
  const { data: reactionRows } = commentIds.length
    ? await supabase.from("comment_reactions").select("comment_id, user_id, emoji").in("comment_id", commentIds)
    : { data: [] as TaskDetailReaction[] };

  const { data: historyRows } = await supabase
    .from("task_history")
    .select("id, from_state, to_state, ts")
    .eq("task_id", taskId)
    .order("ts", { ascending: false });

  // FASE 3: metadatos de archivos adjuntos (migración 0020_task_files.sql).
  const { data: fileRows } = await supabase
    .from("task_files")
    .select("id, file_name, storage_path, size_bytes, content_type, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

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
      description: task.description ?? "",
      version: task.version
    },
    projectTitle: project?.title ?? "",
    members,
    roster,
    depCandidates: (allTasks ?? []).map((t) => ({ id: t.id, title: t.title, status: t.status })),
    assignees: (assigneeRows ?? []).map((a) => a.user_name),
    comments: commentRows ?? [],
    history: historyRows ?? [],
    reactions: reactionRows ?? [],
    viewerId: user.id,
    files: fileRows ?? []
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

const updateDescriptionSchema = z.object({
  taskId: z.string().uuid(),
  description: z.string().max(10000).default("")
});

/**
 * FASE 3 (Drawer — Descripción): guarda la descripción larga del Item.
 * Se mantiene como una Server Action separada de updateTaskDetails (en vez
 * de agregarle un campo más a ese schema estricto) para no tener que exigir
 * title/priority/due/est cada vez que el usuario solo edita la descripción
 * (autosave al perder foco, ver TaskDescriptionField.tsx).
 */
export async function updateTaskDescription(taskId: string, description: string) {
  const parsed = updateDescriptionSchema.parse({ taskId, description });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("version").eq("id", parsed.taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  const { error } = await supabase
    .from("tasks")
    .update({ description: parsed.description, version: task.version + 1 })
    .eq("id", parsed.taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.description.update", object: parsed.taskId });
  revalidatePath("/execution");
}

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

  try {
    const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", task.project_id).single();
    if (project?.workspace_id) {
      await supabase.from("workspace_activity").insert({
        workspace_id: project.workspace_id,
        project_id: task.project_id,
        type: "task.assign",
        text: `Responsables de "${task.title}" actualizados: ${userNames.join(", ") || "ninguno"}`,
        actor: user.email ?? "",
        actor_id: user.id
      });
    }
  } catch {
    // best-effort, no bloquea el flujo principal
  }

  const { data: propio } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();
  await dispatchAutomations({
    type: "task.assigned",
    taskId,
    projectId: task.project_id,
    // La asignación se guarda por NOMBRE (task_assignees.user_name, sin FK), así
    // que «me asignaron a mí» se resuelve comparando con el del perfil. Es la
    // misma limitación que documenta loadMyTasks.
    assignedToMe: Boolean(propio?.name && userNames.includes(propio.name))
  });

  revalidatePath("/execution");
}

export async function setTaskDeps(taskId: string, depIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: task } = await supabase.from("tasks").select("version").eq("id", taskId).single();
  if (!task) throw new Error("Tarea no encontrada");

  const cleanDeps = Array.from(new Set(depIds.filter((id) => id !== taskId)));
  const { error } = await supabase.from("tasks").update({ deps: cleanDeps, version: task.version + 1 }).eq("id", taskId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.deps", object: taskId, meta: { deps: cleanDeps } });
  revalidatePath("/execution");
}

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

  // Las menciones se resuelven contra el ROSTER, no contra un regex sobre el
  // texto libre. El regex viejo cortaba en el primer espacio: «@Luis Varsa»
  // guardaba «Luis», y con eso no se puede avisar a nadie. Un nombre que no
  // esté en el roster no produce mención: no se adivina.
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", task.project_id).single();
  let roster: RosterMember[] = [];
  if (project?.workspace_id) {
    const { data: rows } = await supabase.rpc("list_workspace_members", { p_workspace_id: project.workspace_id });
    roster = (rows ?? []).map((m: { user_id: string; user_name: string }) => ({ userId: m.user_id, name: m.user_name }));
  }
  if (!roster.length && profile?.name) roster = [{ userId: user.id, name: profile.name }];

  const { userIds: mentionedUserIds, names: mentions } = parseMentions(trimmed, roster);

  const { error } = await supabase.from("comments").insert({
    subject_type: "task",
    subject_id: taskId,
    author_id: user.id,
    author_name: profile?.name ?? user.email ?? "Usuario",
    body: trimmed,
    // Las dos: `mentions` sostiene el histórico ya escrito y lo que se pinta;
    // `mentioned_user_ids` sostiene la bandeja (migración 0037).
    mentions,
    mentioned_user_ids: mentionedUserIds
  });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "comment.add", object: taskId, meta: { mentions } });

  try {
    if (project?.workspace_id) {
      await supabase.from("workspace_activity").insert({
        workspace_id: project.workspace_id,
        project_id: task.project_id,
        type: "comment",
        text: `Comentario en "${task.title}"`,
        actor: user.email ?? "",
        actor_id: user.id
      });
    }
  } catch {
    // best-effort
  }

  await dispatchAutomations({
    type: "comment.added",
    taskId,
    projectId: task.project_id,
    // Que el comentario mencione a QUIEN TIENE la regla, no a cualquiera: una
    // automatización es del usuario, y «cuando me mencionen» significa a él.
    mentionsMe: mentionedUserIds.includes(user.id)
  });

  revalidatePath("/execution");
}
