// src/lib/domain/execution/reactions.ts
// Reacciones a un comentario — lógica pura, sin React ni Supabase (probada en
// tests/domain/execution-reactions.test.ts).

/** Fila cruda de `comment_reactions`, ya traducida. */
export interface ReactionLike {
  commentId: string;
  userId: string;
  emoji: string;
}

export interface ReactionCount {
  emoji: string;
  count: number;
  /** Si el usuario que mira ya reaccionó con este emoji: el botón sale activo. */
  mine: boolean;
}

/**
 * El emoji que además de reaccionar CIERRA la tarea.
 *
 * Es uno solo y está aquí, no repartido por la interfaz, porque su significado
 * no es decorativo: al pulsarlo se intenta una transición de estado real, que
 * pasa por `evaluateTransition` y puede ser rechazada. Cambiarlo por otro
 * símbolo es cambiar qué gesto completa una tarea.
 */
export const DONE_EMOJI = "✅";

/** La paleta que ofrece el hilo. Corta a propósito: veinte emojis no es una decisión, es un menú. */
export const REACTION_PALETTE = [DONE_EMOJI, "👍", "👀", "🎉", "❓"] as const;

/**
 * Agrupa las reacciones de UN comentario para pintarlas.
 *
 * El orden es el de `REACTION_PALETTE` y no el de llegada: si dependiera de
 * quién reaccionó primero, los botones bailarían de sitio entre recargas y
 * pulsar el de al lado sería cuestión de suerte. Lo que no está en la paleta va
 * después, por orden alfabético, para que un emoji llegado de otra parte
 * tampoco se coloque al azar.
 */
export function summarizeReactions(
  reactions: readonly ReactionLike[],
  commentId: string,
  viewerId: string | null
): ReactionCount[] {
  const porEmoji = new Map<string, { count: number; mine: boolean }>();

  for (const r of reactions) {
    if (r.commentId !== commentId) continue;
    const actual = porEmoji.get(r.emoji) ?? { count: 0, mine: false };
    porEmoji.set(r.emoji, {
      count: actual.count + 1,
      mine: actual.mine || (viewerId !== null && r.userId === viewerId)
    });
  }

  const rank = (emoji: string) => {
    const i = (REACTION_PALETTE as readonly string[]).indexOf(emoji);
    return i === -1 ? REACTION_PALETTE.length : i;
  };

  return [...porEmoji.entries()]
    .map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }))
    .sort((a, b) => (rank(a.emoji) === rank(b.emoji) ? a.emoji.localeCompare(b.emoji) : rank(a.emoji) - rank(b.emoji)));
}

/**
 * Qué hace un clic: poner o quitar. Reaccionar con lo que ya tienes puesto lo
 * quita, que es lo que espera cualquiera que haya usado un chat.
 */
export function toggleIntent(
  reactions: readonly ReactionLike[],
  commentId: string,
  viewerId: string,
  emoji: string
): "add" | "remove" {
  const ya = reactions.some((r) => r.commentId === commentId && r.userId === viewerId && r.emoji === emoji);
  return ya ? "remove" : "add";
}
