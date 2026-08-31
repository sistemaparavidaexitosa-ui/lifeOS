"use server";
// Acciones que se ejercen SOBRE un mensaje del hilo, sin escribir otro:
// reaccionar, completar la tarea con ✅, fijar a la bitácora y recordar.
//
// Van aparte de task-detail-actions.ts porque comparten una idea que las otras
// no tienen: el sujeto es el comentario, no la tarea.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { evaluateTransition } from "@/lib/domain/task-state.ts";
import { DONE_EMOJI } from "@/lib/domain/execution/reactions.ts";
import { presetDate, type ReminderPreset } from "@/lib/domain/execution/reminders.ts";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import type { TaskStatus } from "@/lib/domain/types.ts";

export interface ThreadActionResult {
  ok: boolean;
  /** Por qué no se pudo. La interfaz lo muestra tal cual. */
  reason?: string;
}

const reactionSchema = z.object({
  commentId: z.string().uuid(),
  emoji: z.string().min(1).max(8)
});

/**
 * Poner o quitar una reacción.
 *
 * El `delete` va primero SIEMPRE, también al poner: la clave primaria compuesta
 * de `comment_reactions` ya impide duplicados, pero borrar antes hace la
 * operación idempotente sin depender de que el cliente sepa el estado actual —
 * dos pestañas abiertas no tienen por qué coincidir.
 */
export async function toggleReaction(commentId: string, emoji: string, intent: "add" | "remove"): Promise<ThreadActionResult> {
  const parsed = reactionSchema.safeParse({ commentId, emoji });
  if (!parsed.success) return { ok: false, reason: "Reacción no válida." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  await supabase
    .from("comment_reactions")
    .delete()
    .eq("comment_id", parsed.data.commentId)
    .eq("user_id", user.id)
    .eq("emoji", parsed.data.emoji);

  if (intent === "add") {
    const { error } = await supabase
      .from("comment_reactions")
      .insert({ comment_id: parsed.data.commentId, user_id: user.id, emoji: parsed.data.emoji });
    if (error) return { ok: false, reason: error.message };
  }

  revalidatePath("/execution");
  return { ok: true };
}

/**
 * ✅ además de reaccionar, COMPLETA la tarea.
 *
 * Y pasa por `evaluateTransition` como cualquier otro camino hacia Completed:
 * una tarea con dependencias abiertas no se puede cerrar con un emoji. No hay
 * validación nueva aquí — la máquina de estados que ya protege StatusMenu,
 * Kanban y el arrastre del tablero protege también esto (D-056 dejó el hilo
 * listo para recibirlo).
 *
 * Si la transición se rechaza, la reacción SE QUEDA puesta: el usuario expresó
 * algo («esto ya está») que sigue siendo cierto, y lo que falla es cerrarla.
 * Deshacer las dos cosas escondería el motivo real.
 */
export async function reactDone(commentId: string, taskId: string, intent: "add" | "remove"): Promise<ThreadActionResult> {
  const reaction = await toggleReaction(commentId, DONE_EMOJI, intent);
  if (!reaction.ok) return reaction;
  // Quitar el ✅ no reabre la tarea: reabrir es una decisión, no la retirada de
  // un gesto. Se hace desde el selector de estado, con su nombre.
  if (intent === "remove") return { ok: true };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (!task) return { ok: false, reason: "Tarea no encontrada." };
  if (task.status === "Completed") return { ok: true };

  let depStatuses: Record<string, TaskStatus> = {};
  if (task.deps?.length) {
    const { data: deps } = await supabase.from("tasks").select("id, status").in("id", task.deps);
    depStatuses = Object.fromEntries((deps ?? []).map((d) => [d.id, d.status as TaskStatus]));
  }

  const check = evaluateTransition({ status: task.status as TaskStatus, deps: task.deps ?? [] }, "Completed", depStatuses);
  if (!check.ok) return { ok: false, reason: check.message ?? "No se puede completar todavía." };

  const { error } = await supabase
    .from("tasks")
    .update({ status: "Completed", completed_at: new Date().toISOString(), version: task.version + 1 })
    .eq("id", taskId);
  if (error) return { ok: false, reason: error.message };

  await supabase.from("task_history").insert({ task_id: taskId, from_state: task.status, to_state: "Completed" });
  await supabase
    .from("audit_log")
    .insert({ user_id: user.id, action: "task.status", object: taskId, meta: { to: "Completed", via: "reaction" } });

  revalidatePath("/execution");
  revalidatePath("/home");
  return { ok: true };
}

const LOG_TYPES = ["decision", "learning"] as const;
export type PinType = (typeof LOG_TYPES)[number];

/**
 * Fijar un comentario a la bitácora del proyecto.
 *
 * La bitácora y la base de conocimiento existen desde 0003 y se pintan desde el
 * menú del proyecto; lo que faltaba era el camino DESDE la conversación hasta
 * ellas. Una decisión que se toma en un hilo y se queda en el hilo se pierde en
 * cuanto hay veinte comentarios más.
 *
 * Se copia el texto, no se referencia el comentario: la bitácora es un registro
 * de lo que se decidió, y tiene que seguir diciéndolo aunque el comentario se
 * borre después.
 */
export async function pinCommentToLogbook(commentId: string, type: PinType): Promise<ThreadActionResult> {
  if (!LOG_TYPES.includes(type)) return { ok: false, reason: "Tipo no válido." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const { data: comment } = await supabase
    .from("comments")
    .select("body, author_name, subject_id, subject_type")
    .eq("id", commentId)
    .single();
  if (!comment) return { ok: false, reason: "Comentario no encontrado." };

  // El sujeto puede ser una tarea o el propio proyecto (hilo de proyecto).
  // Antes esto cortaba en seco con `subject_type !== "task"`, así que fijar una
  // decisión tomada en el hilo del proyecto —justo donde se toman— devolvía
  // «Comentario no encontrado», que además es falso: ahí estaba.
  let projectId: string;
  let donde: string;

  if (comment.subject_type === "task") {
    const { data: task } = await supabase.from("tasks").select("project_id, title").eq("id", comment.subject_id).single();
    if (!task) return { ok: false, reason: "La tarea de ese comentario ya no existe." };
    projectId = task.project_id;
    donde = task.title;
  } else {
    const { data: project } = await supabase.from("projects").select("id, title").eq("id", comment.subject_id).single();
    if (!project) return { ok: false, reason: "El proyecto de ese comentario ya no existe." };
    projectId = project.id;
    donde = `el hilo de ${project.title}`;
  }

  const { error } = await supabase.from("logbook").insert({
    user_id: user.id,
    project_id: projectId,
    type,
    // Se anota de dónde salió: sin el contexto, media bitácora acaba siendo
    // frases sueltas que nadie sabe a qué respondían.
    text: `${comment.body} — ${comment.author_name}, en «${donde}»`
  });
  if (error) return { ok: false, reason: error.message };

  await supabase.from("audit_log").insert({ user_id: user.id, action: "logbook.pin", object: commentId, meta: { type } });
  revalidatePath("/execution");
  return { ok: true };
}

const PRESETS: ReminderPreset[] = ["manana", "en-3-dias", "proxima-semana"];

/** Recordarme esto. Privado: nadie ve los recordatorios de otro. */
export async function createReminder(
  subjectType: "task" | "comment",
  subjectId: string,
  preset: ReminderPreset,
  text: string
): Promise<ThreadActionResult> {
  if (!PRESETS.includes(preset)) return { ok: false, reason: "Plazo no válido." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  // El día se decide en la zona del perfil, no en la del servidor: con UTC, un
  // «mañana» pedido esta tarde en México caería pasado mañana.
  const today = todayLocal(await getUserTimeZone());

  const { error } = await supabase.from("reminders").insert({
    user_id: user.id,
    subject_type: subjectType,
    subject_id: subjectId,
    text: text.slice(0, 300),
    remind_on: presetDate(preset, today)
  });
  if (error) return { ok: false, reason: error.message };

  revalidatePath("/home");
  return { ok: true };
}

export async function completeReminder(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("reminders").update({ done: true }).eq("id", id).eq("user_id", user.id);
  revalidatePath("/home");
}
