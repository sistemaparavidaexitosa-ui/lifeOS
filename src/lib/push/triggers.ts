import "server-only";

import { notify } from "./notify";

/**
 * Los avisos que nacen de una acción de otra persona.
 *
 * Viven juntos y no dentro de cada Server Action por una razón concreta: la
 * mención se escribe en DOS sitios —el hilo de una tarea y el de un proyecto—
 * y ya hay una asimetría histórica entre ellos (`addProjectComment` nunca
 * despachó automatizaciones). Duplicar aquí el texto del aviso garantizaría
 * que un día solo suene uno de los dos hilos.
 *
 * Todos son best-effort: `notify` no lanza (D-021).
 */

/** Recorte del cuerpo de un comentario para el aviso. */
const MAX_CUERPO = 140;

/**
 * A dónde lleva una mención.
 *
 * Estas dos URLs eran de `loadUnreadMentions`, que derivaba la bandeja de
 * `comments` en cada render. Desde 0049 el aviso se materializa aquí, al
 * escribirse el comentario, y `notifications.href` guarda el resultado: quien
 * pinta la campana ya no vuelve a decidir a dónde lleva cada cosa.
 */
export function hrefDeComentario(subjectType: "task" | "project", subjectId: string): string {
  return subjectType === "task" ? `/execution?task=${subjectId}` : `/execution?project=${subjectId}&view=hilo`;
}

export interface MentionNotice {
  commentId: string;
  subjectType: "task" | "project";
  subjectId: string;
  /** Título de la tarea o del proyecto: sin esto el aviso no dice dónde. */
  subjectTitle: string;
  authorId: string;
  authorName: string;
  body: string;
  mentionedUserIds: readonly string[];
}

export async function notifyMentions(m: MentionNotice): Promise<void> {
  // Nunca a uno mismo. Es el mismo criterio del `.neq("author_id", user.id)`
  // de la bandeja: mencionarte en tu propio comentario no es un aviso.
  const destinatarios = [...new Set(m.mentionedUserIds)].filter((id) => id !== m.authorId);

  for (const userId of destinatarios) {
    await notify({
      userId,
      kind: "mention",
      title: `${m.authorName} te mencionó en «${m.subjectTitle}»`,
      body: m.body.slice(0, MAX_CUERPO),
      href: hrefDeComentario(m.subjectType, m.subjectId),
      // Por comentario, no por persona-y-comentario: cada destinatario tiene su
      // propia fila, y el UNIQUE de la tabla es (user_id, dedupe_key).
      dedupeKey: `mention:${m.commentId}`
    });
  }
}

export interface AssignmentNotice {
  taskId: string;
  taskTitle: string;
  actorId: string;
  actorName: string;
  /** SOLO los recién añadidos: a quien ya estaba no se le vuelve a avisar. */
  nuevosUserIds: readonly string[];
  /** Fecha local de quien asigna (D-016/D-018), para la clave de idempotencia. */
  todayISO: string;
}

export async function notifyAssignments(a: AssignmentNotice): Promise<void> {
  const destinatarios = [...new Set(a.nuevosUserIds)].filter((id) => id !== a.actorId);

  for (const userId of destinatarios) {
    await notify({
      userId,
      kind: "task.assigned",
      title: "Te asignaron una tarea",
      body: `${a.actorName}: «${a.taskTitle}»`,
      href: `/execution?task=${a.taskId}`,
      // La fecha entra en la clave a propósito: quitar y volver a poner a
      // alguien el mismo día no debe sonar dos veces, pero reasignarle la
      // tarea la semana que viene sí es un aviso nuevo.
      dedupeKey: `assign:${a.taskId}:${a.todayISO}`
    });
  }
}
