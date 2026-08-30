// tests/domain/search-query.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuery, isSearchable, hitHref, type SearchHitLike } from "../../src/lib/domain/search/query.ts";

const WS = "ws-1";

test("parseQuery: sin filtros, todo es texto", () => {
  const q = parseQuery("informe de cierre");
  assert.strictEqual(q.text, "informe de cierre");
  assert.strictEqual(q.kind, null);
  assert.strictEqual(q.author, null);
});

test("parseQuery: `de:` saca el autor del texto", () => {
  const q = parseQuery("presupuesto de:ana");
  assert.strictEqual(q.text, "presupuesto");
  assert.strictEqual(q.author, "ana");
});

test("parseQuery: `tipo:` acepta español y singular o plural", () => {
  assert.strictEqual(parseQuery("tipo:tarea").kind, "task");
  assert.strictEqual(parseQuery("tipo:comentarios").kind, "comment");
  assert.strictEqual(parseQuery("tipo:NOTA").kind, "note");
});

test("parseQuery: un `tipo:` que no existe se reporta, no se ignora en silencio", () => {
  const q = parseQuery("tipo:pizza");
  assert.deepStrictEqual(q.unknown, ["tipo:pizza"]);
  assert.strictEqual(q.kind, null);
});

test("parseQuery: `antes:` y `desde:` solo aceptan fecha ISO", () => {
  const bueno = parseQuery("antes:2026-08-01 desde:2026-01-15");
  assert.strictEqual(bueno.beforeISO, "2026-08-01");
  assert.strictEqual(bueno.sinceISO, "2026-01-15");

  const malo = parseQuery("antes:ayer");
  assert.strictEqual(malo.beforeISO, null);
  assert.deepStrictEqual(malo.unknown, ["antes:ayer"]);
});

test("parseQuery: una hora NO se confunde con un filtro", () => {
  // «13:30» tiene dos puntos pero no es una clave conocida: es texto.
  const q = parseQuery("reunión 13:30");
  assert.strictEqual(q.text, "reunión 13:30");
  assert.deepStrictEqual(q.unknown, []);
});

test("parseQuery: los dos puntos sueltos o al final no son filtro", () => {
  assert.strictEqual(parseQuery("nota: pendiente").text, "nota: pendiente");
  assert.strictEqual(parseQuery(":cosa").text, ":cosa");
});

test("parseQuery: varios filtros a la vez, con el texto limpio", () => {
  const q = parseQuery("de:ana tipo:comentario cierre antes:2026-09-01");
  assert.strictEqual(q.text, "cierre");
  assert.strictEqual(q.author, "ana");
  assert.strictEqual(q.kind, "comment");
  assert.strictEqual(q.beforeISO, "2026-09-01");
});

test("isSearchable: una sola letra no basta", () => {
  assert.strictEqual(isSearchable(parseQuery("a")), false);
});

test("isSearchable: dos letras sí", () => {
  assert.strictEqual(isSearchable(parseQuery("ab")), true);
});

test("isSearchable: solo filtros también es una pregunta legítima", () => {
  assert.strictEqual(isSearchable(parseQuery("tipo:nota de:ana")), true);
});

test("isSearchable: vacío no", () => {
  assert.strictEqual(isSearchable(parseQuery("   ")), false);
});

const hit = (over: Partial<SearchHitLike>): SearchHitLike => ({
  kind: "task",
  id: "x",
  projectId: null,
  taskId: null,
  notebookId: null,
  ...over
});

test("hitHref: una tarea abre su drawer", () => {
  assert.strictEqual(hitHref(hit({ kind: "task", id: "t1" }), WS), "/execution?ws=ws-1&task=t1");
});

test("hitHref: un comentario lleva a SU tarea — no tiene pantalla propia", () => {
  assert.strictEqual(hitHref(hit({ kind: "comment", id: "c1", taskId: "t9" }), WS), "/execution?ws=ws-1&task=t9");
});

test("hitHref: un comentario huérfano cae en la cartera, no en una URL rota", () => {
  assert.strictEqual(hitHref(hit({ kind: "comment", id: "c1" }), WS), "/execution?ws=ws-1");
});

test("hitHref: una nota abre su cuaderno y su nota", () => {
  assert.strictEqual(
    hitHref(hit({ kind: "note", id: "n1", notebookId: "nb1" }), WS),
    "/notebooks?ws=ws-1&notebook=nb1&note=n1"
  );
});

test("hitHref: la actividad lleva al proyecto donde ocurrió", () => {
  assert.strictEqual(hitHref(hit({ kind: "activity", id: "a1", projectId: "p1" }), WS), "/execution?ws=ws-1&project=p1");
});

test("hitHref: actividad sin proyecto lleva al feed", () => {
  assert.strictEqual(hitHref(hit({ kind: "activity", id: "a1" }), WS), "/activity?ws=ws-1");
});
