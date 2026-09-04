"use server";
// EL HILO DE UN PROYECTO.
//
// Sin tabla nueva: `comments.subject_type` acepta 'project' desde la migración
// 0003 y sus políticas de lectura, escritura y borrado ya resuelven las dos
// ramas. Lo único que faltaba en la base eran las reacciones, atadas a `tasks`
// con un join literal hasta la 0041.
//
// Va en su propio archivo y no dentro de task-detail-actions.ts porque el
// sujeto es otro: aquí no hay tarea, ni estado que evaluar, ni dependencias.
// Lo que se comparte —casar menciones, reaccionar, fijar, recordar— ya vive
// fuera de los dos (domain/execution/mentions.ts, thread-actions.ts).
//
// AQUÍ NO SE LEE `workspace_activity`, Y ES DELIBERADO
// Hasta ahora se intercalaban los eventos del proyecto entre los mensajes, con
// la idea de que dieran contexto como los mensajitos grises de un chat. La
// pantalla que responde a «qué ha pasado aquí» ya existe y es /activity, que
// los enseña completos y agrupados por día; repetirlos en el hilo no añadía
// contexto, enterraba la conversación. El hilo responde a otra pregunta: «qué
// nos dijimos». Solo comentarios y menciones de los miembros del espacio.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/data/activity";
import { parseMentions, type RosterMember } from "@/lib/domain/execution/mentions.ts";
import type { ThreadCommentLike } from "@/lib/domain/execution/thread.ts";

export interface ProjectThreadComment extends ThreadCommentLike {
  mentions: string[];
}

export interface ProjectThreadReaction {
  comment_id: string;
  user_id: string;
  emoji: string;
}

export interface ProjectThreadResult {
  projectTitle: string;
  comments: ProjectThreadComment[];
  reactions: ProjectThreadReaction[];
  roster: RosterMember[];
  viewerId: string;
}

export async function getProjectThread(projectId: string): Promise<ProjectThreadResult> {
  const id = z.string().uuid().parse(projectId);

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id, title, workspace_id")
    .eq("id", id)
    .single();
  if (projectErr || !project) throw new Error("Proyecto no encontrado");

  // El roster con IDS, no solo nombres: sin el id la mención vuelve a ser un
  // nombre suelto y la bandeja no sabe a quién avisar. Mismo camino que
  // getTaskDetail — el RPC existe porque la política de `memberships` solo
  // expone la fila propia (fix 0012).
  let roster: RosterMember[] = [];
  const { data: memberRows } = await supabase.rpc("list_workspace_members", { p_workspace_id: project.workspace_id });
  roster = ((memberRows ?? []) as { user_id: string; user_name: string }[]).map((m) => ({
    userId: m.user_id,
    name: m.user_name
  }));
  if (!roster.length) {
    // Red de seguridad para una cuenta anterior a 0030 sin membresía Owner:
    // sin esto no podría mencionarse ni a sí misma.
    const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();
    if (profile?.name) roster = [{ userId: user.id, name: profile.name }];
  }

  const { data: commentRows } = await supabase
    .from("comments")
    .select("id, body, author_name, mentions, created_at")
    .eq("subject_type", "project")
    .eq("subject_id", id)
    .order("created_at", { ascending: true });

  // Una sola consulta para las reacciones de TODOS los mensajes: una por
  // mensaje sería N+1 en un hilo largo.
  const commentIds = (commentRows ?? []).map((c) => c.id);
  const { data: reactionRows } = commentIds.length
    ? await supabase.from("comment_reactions").select("comment_id, user_id, emoji").in("comment_id", commentIds)
    : { data: [] as ProjectThreadReaction[] };

  return {
    projectTitle: project.title,
    comments: (commentRows ?? []).map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.author_name,
      mentions: c.mentions ?? [],
      createdAt: c.created_at
    })),
    reactions: (reactionRows ?? []) as ProjectThreadReaction[],
    roster,
    viewerId: user.id
  };
}

/**
 * Escribir en el hilo del proyecto.
 *
 * Espejo de addTaskComment: las menciones se resuelven contra el ROSTER y no
 * con un regex sobre el texto libre. Un nombre que no esté en el roster no
 * produce mención — no se adivina.
 */
export async function addProjectComment(projectId: string, body: string) {
  const id = z.string().uuid().parse(projectId);
  const trimmed = body.trim();
  if (!trimmed) return;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: project } = await supabase.from("projects").select("id, title, workspace_id").eq("id", id).single();
  if (!project) throw new Error("Proyecto no encontrado");

  const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();

  let roster: RosterMember[] = [];
  const { data: memberRows } = await supabase.rpc("list_workspace_members", { p_workspace_id: project.workspace_id });
  roster = ((memberRows ?? []) as { user_id: string; user_name: string }[]).map((m) => ({
    userId: m.user_id,
    name: m.user_name
  }));
  if (!roster.length && profile?.name) roster = [{ userId: user.id, name: profile.name }];

  const { userIds: mentionedUserIds, names: mentions } = parseMentions(trimmed, roster);

  const { error } = await supabase.from("comments").insert({
    subject_type: "project",
    subject_id: id,
    author_id: user.id,
    author_name: profile?.name ?? user.email ?? "Usuario",
    body: trimmed,
    // Las dos: `mentions` sostiene lo que se pinta y el histórico;
    // `mentioned_user_ids` sostiene la bandeja (migración 0037).
    mentions,
    mentioned_user_ids: mentionedUserIds
  });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "comment.add", object: id, meta: { mentions } });

  await recordActivity({
    workspaceId: project.workspace_id,
    projectId: id,
    // La fila SIGUE escribiéndose aunque el hilo ya no pinte eventos: quien
    // mira /activity quiere saber que aquí se habló, y el tipo propio deja
    // distinguirlo de un comentario de tarea sin adivinarlo por el texto.
    type: "comment.project",
    text: `escribió en el hilo de "${project.title}"`
  });

  revalidatePath("/execution");
}
