"use server";

// Server Actions del modal de tarea completo (assignees + deps + comentarios
// + historial). Reutiliza el esquema ya existente (task_assignees, comments,
// task_history) — sin migraciones SQL nuevas.

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
        actor: user.email ?? ""
      });
    }
  } catch {
    // best-effort, no bloquea el flujo principal
  }

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
