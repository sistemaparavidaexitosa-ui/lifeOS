// tests/domain/ai-chat.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TITULO_TAREA,
  MAX_TURNOS,
  recortarHistorial,
  sanitizeProposedTask,
  type ChatMessageLike
} from "../../src/lib/domain/ai/chat.ts";

function turno(id: string, role: "user" | "assistant"): ChatMessageLike {
  return { id, role, content: id, createdAt: `2026-09-0${(Number(id.slice(1)) % 9) + 1}T10:00:00Z` };
}

test("recortarHistorial: una conversación corta viaja entera", () => {
  const h = [turno("u1", "user"), turno("a1", "assistant"), turno("u2", "user")];
  assert.deepStrictEqual(recortarHistorial(h).map((m) => m.id), ["u1", "a1", "u2"]);
});

test("recortarHistorial: se queda con los MÁS RECIENTES, no con los primeros", () => {
  const h = Array.from({ length: 20 }, (_, i) => turno(`m${i}`, i % 2 === 0 ? "user" : "assistant"));
  const v = recortarHistorial(h, 4);
  assert.deepStrictEqual(v.map((m) => m.id), ["m16", "m17", "m18", "m19"]);
});

test("recortarHistorial: si el corte cae en una respuesta, la ventana empieza en el usuario siguiente", () => {
  const h = [turno("u1", "user"), turno("a1", "assistant"), turno("u2", "user"), turno("a2", "assistant")];
  // Un corte de 3 dejaría arriba «a1», que el modelo leería como si se lo
  // hubieran dicho a él.
  assert.deepStrictEqual(recortarHistorial(h, 3).map((m) => m.id), ["u2", "a2"]);
});

test("recortarHistorial: una ventana que solo contiene respuestas se queda vacía", () => {
  const h = [turno("a1", "assistant"), turno("a2", "assistant")];
  assert.deepStrictEqual(recortarHistorial(h, 2), []);
});

test("recortarHistorial: sin mensajes devuelve una lista vacía", () => {
  assert.deepStrictEqual(recortarHistorial([]), []);
});

test("recortarHistorial: el tope por defecto son MAX_TURNOS", () => {
  const h = Array.from({ length: 40 }, (_, i) => turno(`m${i}`, "user"));
  assert.strictEqual(recortarHistorial(h).length, MAX_TURNOS);
});

test("sanitizeProposedTask: un título normal pasa tal cual", () => {
  assert.strictEqual(sanitizeProposedTask("Aplicar las migraciones"), "Aplicar las migraciones");
});

test("sanitizeProposedTask: no deja pasar fechas (mismo criterio que sanitizePlan)", () => {
  assert.strictEqual(sanitizeProposedTask("Aplicar migraciones el 2026-09-04"), "Aplicar migraciones el");
  assert.strictEqual(sanitizeProposedTask("Pagar tarjeta, 15/09"), "Pagar tarjeta");
});

test("sanitizeProposedTask: sin propuesta devuelve null y no un título vacío", () => {
  assert.strictEqual(sanitizeProposedTask(null), null);
  assert.strictEqual(sanitizeProposedTask(undefined), null);
  assert.strictEqual(sanitizeProposedTask("   "), null);
  assert.strictEqual(sanitizeProposedTask("ok"), null);
});

test("sanitizeProposedTask: un párrafo se corta al tope y se marca", () => {
  const largo = sanitizeProposedTask("A".repeat(300));
  assert.ok(largo);
  assert.strictEqual(largo.length, MAX_TITULO_TAREA);
  assert.ok(largo.endsWith("…"));
});

test("sanitizeProposedTask: colapsa los espacios de más", () => {
  assert.strictEqual(sanitizeProposedTask("  Revisar   el   presupuesto  "), "Revisar el presupuesto");
});
