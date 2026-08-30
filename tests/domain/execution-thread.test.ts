// tests/domain/execution-thread.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeThread, describeTransition } from "../../src/lib/domain/execution/thread.ts";

const comentario = (id: string, at: string, body = "hola") => ({
  id,
  body,
  authorName: "Ana",
  createdAt: at
});
const cambio = (id: string, at: string, from: string | null, to: string) => ({
  id,
  fromState: from,
  toState: to,
  ts: at
});

test("mergeThread: intercala comentarios y cambios en un solo orden ascendente", () => {
  const t = mergeThread(
    [comentario("c1", "2026-08-01T10:00:00Z"), comentario("c2", "2026-08-01T12:00:00Z")],
    [cambio("h1", "2026-08-01T11:00:00Z", "Pending", "InProgress")]
  );
  assert.deepStrictEqual(t.map((e) => e.id), ["c1", "h1", "c2"]);
});

test("mergeThread: el historial venía descendente y ahora sale ascendente", () => {
  const t = mergeThread(
    [],
    [cambio("h2", "2026-08-02T10:00:00Z", "InProgress", "Completed"), cambio("h1", "2026-08-01T10:00:00Z", null, "Pending")]
  );
  assert.deepStrictEqual(t.map((e) => e.id), ["h1", "h2"]);
});

test("mergeThread: con la misma marca de tiempo el orden es estable entre recargas", () => {
  const mismo = "2026-08-01T10:00:00Z";
  const a = mergeThread([comentario("c1", mismo)], [cambio("h1", mismo, "Pending", "Completed")]);
  const b = mergeThread([comentario("c1", mismo)], [cambio("h1", mismo, "Pending", "Completed")]);
  assert.deepStrictEqual(a.map((e) => e.id), b.map((e) => e.id));
});

test("mergeThread: distingue el tipo de cada entrada", () => {
  const t = mergeThread([comentario("c1", "2026-08-01T10:00:00Z")], [cambio("h1", "2026-08-01T11:00:00Z", null, "Pending")]);
  assert.strictEqual(t[0]?.kind, "comment");
  assert.strictEqual(t[1]?.kind, "system");
});

test("mergeThread: sin nada devuelve un hilo vacío", () => {
  assert.deepStrictEqual(mergeThread([], []), []);
});

test("mergeThread: solo comentarios sigue funcionando", () => {
  const t = mergeThread([comentario("c2", "2026-08-02T10:00:00Z"), comentario("c1", "2026-08-01T10:00:00Z")], []);
  assert.deepStrictEqual(t.map((e) => e.id), ["c1", "c2"]);
});

test("describeTransition: el alta se lee como alta, no como transición desde la nada", () => {
  assert.strictEqual(describeTransition(null, "Pending"), "Creada como Pending");
});

test("describeTransition: una transición normal se lee con flecha", () => {
  assert.strictEqual(describeTransition("Pending", "InProgress"), "Pending → InProgress");
});
