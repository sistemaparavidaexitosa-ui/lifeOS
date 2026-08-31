// src/lib/domain/execution/project-thread.ts
// El hilo de un PROYECTO — lógica pura, sin React ni Supabase (probada en
// tests/domain/execution-project-thread.test.ts).
//
// POR QUÉ NO REUTILIZA mergeThread TAL CUAL
// El hilo de una tarea mezcla comentarios con `task_history`: transiciones de
// estado de ESA tarea, que se leen como «Pendiente → Bloqueado». El de un
// proyecto mezcla comentarios con `workspace_activity`, que ya trae el texto
// redactado y, sobre todo, trae QUIÉN lo hizo. Son dos formas distintas del
// mensajito gris, y forzarlas en una sola función significaría inventar un
// `fromState` que aquí no existe.
//
// Lo que sí es idéntico —y por eso está escrito igual— es la regla de orden.

import type { ThreadCommentLike } from "./thread.ts";

export type { ThreadCommentLike };

/** Una fila de `workspace_activity` de este proyecto, ya en forma de mensaje. */
export interface ProjectEventLike {
  id: string;
  /** El tipo crudo de `workspace_activity.type`; lo traduce activityLabel(). */
  type: string;
  text: string;
  /** El nombre de quien lo hizo. Vacío en las filas antiguas, que guardaban correo. */
  actor: string;
  /** ISO con hora. */
  at: string;
}

export type ProjectThreadEntry =
  | { kind: "comment"; id: string; at: string; body: string; authorName: string }
  | { kind: "event"; id: string; at: string; type: string; text: string; actor: string };

/**
 * Conversación y eventos del proyecto en una sola corriente, del más antiguo al
 * más reciente.
 *
 * Ascendente porque una conversación se lee hacia abajo y el último mensaje es
 * el que uno viene a ver.
 *
 * El desempate por id no es capricho, y es la misma razón que en `mergeThread`:
 * escribir en el hilo inserta el comentario Y su fila de actividad en la misma
 * operación, así que pueden compartir marca de tiempo al milisegundo. Sin un
 * segundo criterio, el orden entre ambos cambiaría entre recargas de la misma
 * pantalla.
 */
export function mergeProjectThread(
  comments: readonly ThreadCommentLike[],
  events: readonly ProjectEventLike[]
): ProjectThreadEntry[] {
  const entries: ProjectThreadEntry[] = [
    ...comments.map(
      (c): ProjectThreadEntry => ({
        kind: "comment",
        id: c.id,
        at: c.createdAt,
        body: c.body,
        authorName: c.authorName
      })
    ),
    ...events.map(
      (e): ProjectThreadEntry => ({ kind: "event", id: e.id, at: e.at, type: e.type, text: e.text, actor: e.actor })
    )
  ];

  return entries.sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)));
}

/**
 * Cómo se lee un evento dentro del hilo: «Victor movió "X" a Completado».
 *
 * El nombre va DELANTE del texto, y el texto se guarda sin él (ver
 * `recordActivity` en src/lib/data/activity.ts). Así la misma fila sirve para
 * el hilo, donde el autor es lo primero que se busca, y para /activity, donde
 * el autor va al margen junto a la hora.
 *
 * Sin actor —las filas anteriores a esto guardaban un correo, y las de un
 * borrado de cuenta se quedan sin nadie— se devuelve solo el texto: inventar
 * un «Alguien» sería afirmar algo que la fila no dice.
 */
export function describeEvent(actor: string, text: string): string {
  const who = actor.trim();
  return who ? `${who} ${text}` : text;
}
