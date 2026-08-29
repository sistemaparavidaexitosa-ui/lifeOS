// tests/domain/execution-reactions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeReactions,
  toggleIntent,
  DONE_EMOJI,
  REACTION_PALETTE,
  type ReactionLike
} from "../../src/lib/domain/execution/reactions.ts";

const r = (commentId: string, userId: string, emoji: string): ReactionLike => ({ commentId, userId, emoji });

test("summarizeReactions: cuenta por emoji y marca las mías", () => {
  const out = summarizeReactions([r("c1", "u1", "👍"), r("c1", "u2", "👍")], "c1", "u1");
  assert.deepStrictEqual(out, [{ emoji: "👍", count: 2, mine: true }]);
});

test("summarizeReactions: si no reaccioné, `mine` es falso aunque otros sí", () => {
  const out = summarizeReactions([r("c1", "u2", "👍")], "c1", "u1");
  assert.strictEqual(out[0]?.mine, false);
});

test("summarizeReactions: ignora las reacciones de OTRO comentario", () => {
  const out = summarizeReactions([r("c1", "u1", "👍"), r("c2", "u1", "🎉")], "c1", "u1");
  assert.deepStrictEqual(out.map((x) => x.emoji), ["👍"]);
});

test("summarizeReactions: el orden es el de la paleta, no el de llegada", () => {
  // Sin esto, los botones bailarían de sitio entre recargas.
  const out = summarizeReactions([r("c1", "u1", "❓"), r("c1", "u2", DONE_EMOJI), r("c1", "u3", "👍")], "c1", null);
  assert.deepStrictEqual(out.map((x) => x.emoji), [DONE_EMOJI, "👍", "❓"]);
});

test("summarizeReactions: un emoji fuera de la paleta va al final, no al azar", () => {
  const out = summarizeReactions([r("c1", "u1", "🦊"), r("c1", "u2", "👍")], "c1", null);
  assert.deepStrictEqual(out.map((x) => x.emoji), ["👍", "🦊"]);
});

test("summarizeReactions: sin reacciones devuelve una lista vacía", () => {
  assert.deepStrictEqual(summarizeReactions([], "c1", "u1"), []);
});

test("summarizeReactions: sin espectador identificado nada sale como mío", () => {
  const out = summarizeReactions([r("c1", "u1", "👍")], "c1", null);
  assert.strictEqual(out[0]?.mine, false);
});

test("toggleIntent: reaccionar con algo nuevo lo pone", () => {
  assert.strictEqual(toggleIntent([], "c1", "u1", "👍"), "add");
});

test("toggleIntent: reaccionar con lo que ya tengo lo quita", () => {
  assert.strictEqual(toggleIntent([r("c1", "u1", "👍")], "c1", "u1", "👍"), "remove");
});

test("toggleIntent: la reacción de otro no cuenta como mía", () => {
  assert.strictEqual(toggleIntent([r("c1", "u2", "👍")], "c1", "u1", "👍"), "add");
});

test("DONE_EMOJI está en la paleta y va primero: es el único que cambia el estado", () => {
  assert.strictEqual(REACTION_PALETTE[0], DONE_EMOJI);
});
