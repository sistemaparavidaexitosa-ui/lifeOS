// src/lib/domain/execution/thread.ts
// El hilo de una tarea — lógica pura, sin React ni Supabase (probada en
// tests/domain/execution-thread.test.ts).
//
// POR QUÉ EXISTE
// Los comentarios y el historial de estados se pintaban en DOS tarjetas
// apiladas: primero toda la conversación, debajo toda la cronología. Leerlas
// juntas era imposible — para saber si un comentario se escribió antes o
// después de que la tarea se bloqueara había que comparar dos listas con dos
// relojes distintos, una ascendente y otra descendente.
//
// Son el mismo hilo. Un cambio de estado es lo que en un chat serían los
// mensajitos grises de sistema («X movió esto a Bloqueado»): no son ruido, son
// lo que explica por qué el siguiente comentario dice lo que dice.

export interface ThreadCommentLike {
  id: string;
  body: string;
  authorName: string;
  /** ISO con hora. */
  createdAt: string;
}

export interface ThreadHistoryLike {
  id: string;
  /** Null en la primera transición: la tarea no venía de ningún estado. */
  fromState: string | null;
  toState: string;
  /** ISO con hora. */
  ts: string;
}

export type ThreadEntry =
  | { kind: "comment"; id: string; at: string; body: string; authorName: string }
  | { kind: "system"; id: string; at: string; fromState: string | null; toState: string };

/**
 * Un solo hilo, del más antiguo al más reciente.
 *
 * Ascendente, y no descendente como estaba el historial: una conversación se
 * lee hacia abajo, y el último mensaje es el que uno viene a ver.
 *
 * El desempate por id no es capricho. Al completar una tarea desde el propio
 * hilo, el comentario y la transición se escriben en la misma operación y
 * pueden compartir marca de tiempo al milisegundo; sin un segundo criterio, el
 * orden entre ambos cambiaría entre recargas de la misma pantalla.
 */
export function mergeThread(
  comments: readonly ThreadCommentLike[],
  history: readonly ThreadHistoryLike[]
): ThreadEntry[] {
  const entries: ThreadEntry[] = [
    ...comments.map(
      (c): ThreadEntry => ({ kind: "comment", id: c.id, at: c.createdAt, body: c.body, authorName: c.authorName })
    ),
    ...history.map(
      (h): ThreadEntry => ({ kind: "system", id: h.id, at: h.ts, fromState: h.fromState, toState: h.toState })
    )
  ];

  return entries.sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)));
}

/**
 * Cómo se lee una transición. `from` nulo es el alta de la tarea, no una
 * transición desde la nada: decir «inicio → Pendiente» describe el modelo de
 * datos, no lo que pasó.
 */
export function describeTransition(fromState: string | null, toState: string): string {
  return fromState === null ? `Creada como ${toState}` : `${fromState} → ${toState}`;
}
