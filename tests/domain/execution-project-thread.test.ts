// tests/domain/execution-project-thread.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeProjectThread, describeEvent } from "../../src/lib/domain/execution/project-thread.ts";

const mensaje = (id: string, at: string, body = "hola") => ({
  id,
  body,
  authorName: "Ana",
  createdAt: at
});

const evento = (id: string, at: string, text = 'creó la tarea "Migrar"', actor = "Victor") => ({
  id,
  type: "task.create",
  text,
  actor,
  at
});

test("mergeProjectThread: intercala mensajes y eventos en un solo orden ascendente", () => {
  const t = mergeProjectThread(
    [mensaje("c1", "2026-08-01T10:00:00Z"), mensaje("c2", "2026-08-01T12:00:00Z")],
    [evento("a1", "2026-08-01T11:00:00Z")]
  );
  assert.deepStrictEqual(
    t.map((e) => e.id),
    ["c1", "a1", "c2"]
  );
});

test("mergeProjectThread: la actividad llega descendente de la base y sale ascendente", () => {
  const t = mergeProjectThread(
    [],
    [evento("a2", "2026-08-02T10:00:00Z"), evento("a1", "2026-08-01T10:00:00Z")]
  );
  assert.deepStrictEqual(
    t.map((e) => e.id),
    ["a1", "a2"]
  );
});

test("mergeProjectThread: comentario y su fila de actividad comparten instante y el orden no baila", () => {
  // Escribir en el hilo inserta las dos cosas en la misma operación: sin el
  // desempate por id, el orden cambiaría entre recargas de la misma pantalla.
  const mismo = "2026-08-01T10:00:00Z";
  const a = mergeProjectThread([mensaje("c1", mismo)], [evento("a1", mismo)]);
  const b = mergeProjectThread([mensaje("c1", mismo)], [evento("a1", mismo)]);
  assert.deepStrictEqual(
    a.map((e) => e.id),
    b.map((e) => e.id)
  );
});

test("mergeProjectThread: distingue el tipo de cada entrada", () => {
  const t = mergeProjectThread([mensaje("c1", "2026-08-01T10:00:00Z")], [evento("a1", "2026-08-01T11:00:00Z")]);
  assert.strictEqual(t[0]?.kind, "comment");
  assert.strictEqual(t[1]?.kind, "event");
});

test("mergeProjectThread: el evento conserva su tipo crudo para poder etiquetarlo", () => {
  const t = mergeProjectThread([], [evento("a1", "2026-08-01T11:00:00Z")]);
  const primero = t[0];
  assert.strictEqual(primero?.kind, "event");
  if (primero?.kind === "event") assert.strictEqual(primero.type, "task.create");
});

test("mergeProjectThread: sin nada devuelve un hilo vacío", () => {
  assert.deepStrictEqual(mergeProjectThread([], []), []);
});

test("mergeProjectThread: solo mensajes sigue funcionando", () => {
  const t = mergeProjectThread([mensaje("c2", "2026-08-02T10:00:00Z"), mensaje("c1", "2026-08-01T10:00:00Z")], []);
  assert.deepStrictEqual(
    t.map((e) => e.id),
    ["c1", "c2"]
  );
});

test("describeEvent: el autor va delante y el texto se guarda sin él", () => {
  assert.strictEqual(describeEvent("Victor", 'creó la tarea "Migrar"'), 'Victor creó la tarea "Migrar"');
});

test("describeEvent: sin actor no se inventa un «Alguien»", () => {
  assert.strictEqual(describeEvent("", 'creó la tarea "Migrar"'), 'creó la tarea "Migrar"');
  assert.strictEqual(describeEvent("   ", "movió 5 tareas a Completado"), "movió 5 tareas a Completado");
});
