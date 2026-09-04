// tests/domain/ai-chat.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TEXTO_MEMORIA,
  MAX_TITULO_TAREA,
  MAX_TURNOS,
  recortarHistorial,
  sanitizeProposedMemory,
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

// --- Memoria propuesta (A3) --------------------------------------------------
// La regla que importa: una memoria es algo que seguirá siendo verdad dentro de
// seis meses. Un dato del día no lo es, y guardarlo ensucia para siempre el
// prompt de todas las features.

test("sanitizeProposedMemory: acepta un hecho duradero con su ámbito", () => {
  assert.deepStrictEqual(sanitizeProposedMemory({ text: "Es celíaco: nada con gluten.", scope: "preference" }), {
    text: "Es celíaco: nada con gluten.",
    scope: "preference"
  });
});

test("sanitizeProposedMemory: null cuando no hay nada que proponer, que es el caso normal", () => {
  assert.strictEqual(sanitizeProposedMemory(null), null);
  assert.strictEqual(sanitizeProposedMemory({ text: "   ", scope: "preference" }), null);
});

test("sanitizeProposedMemory: rechaza un ámbito que la base no admite, en vez de dejar que falle el insert", () => {
  assert.strictEqual(sanitizeProposedMemory({ text: "Entrena por las mañanas.", scope: "inventado" }), null);
});

test("sanitizeProposedMemory: rechaza el dato del día — «hoy comí» no es memoria", () => {
  assert.strictEqual(sanitizeProposedMemory({ text: "Hoy comió avena y dos huevos.", scope: "habit" }), null);
  assert.strictEqual(sanitizeProposedMemory({ text: "Ayer no entrenó.", scope: "habit" }), null);
});

test("sanitizeProposedMemory: rechaza lo que lleva una fecha dentro, igual que sanitizeProposedTask", () => {
  assert.strictEqual(sanitizeProposedMemory({ text: "Cambió de trabajo el 2026-08-01.", scope: "decision" }), null);
});

test("sanitizeProposedMemory: no confunde «mañana» adverbio de tiempo con «por la mañana»", () => {
  assert.deepStrictEqual(sanitizeProposedMemory({ text: "Entrena por la mañana, antes de trabajar.", scope: "habit" }), {
    text: "Entrena por la mañana, antes de trabajar.",
    scope: "habit"
  });
});

test("sanitizeProposedMemory: descarta lo demasiado corto para significar algo", () => {
  assert.strictEqual(sanitizeProposedMemory({ text: "sí", scope: "preference" }), null);
});

test("sanitizeProposedMemory: recorta lo que se pasa de largo en vez de rechazarlo", () => {
  const largo = "a".repeat(400);
  const salida = sanitizeProposedMemory({ text: largo, scope: "goal" });
  assert.ok(salida);
  assert.ok(salida.text.length <= MAX_TEXTO_MEMORIA);
  assert.ok(salida.text.endsWith("…"));
});

test("sanitizeProposedMemory: dos llamadas seguidas con la misma fecha se rechazan las dos (el regex global es stateful)", () => {
  const propuesta = { text: "Cambió de trabajo el 2026-08-01.", scope: "decision" };
  assert.strictEqual(sanitizeProposedMemory(propuesta), null);
  assert.strictEqual(sanitizeProposedMemory(propuesta), null);
});
