// tests/domain/insights-fase2.test.ts
// Fase 2 del motor: huella de deduplicación, máquina de estados y memoria.
import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendationFingerprint } from "../../src/lib/domain/insights/fingerprint.ts";
import {
  ALL_STATUSES,
  canTransition,
  feedsRejectionContext,
  nextStatuses,
  type RecommendationStatus
} from "../../src/lib/domain/insights/states.ts";
import {
  activeMemory,
  isExpired,
  MAX_MEMORY_ITEMS,
  type MemoryItemLike,
  type MemoryScope
} from "../../src/lib/domain/insights/memory.ts";

// --- Huella ----------------------------------------------------------------

test("fingerprint: la misma recomendación da la misma huella", () => {
  const a = recommendationFingerprint("presupuesto", ["budget.overrun.alimentos"]);
  const b = recommendationFingerprint("presupuesto", ["budget.overrun.alimentos"]);
  assert.strictEqual(a, b);
});

test("fingerprint: el orden de los hechos citados no la cambia", () => {
  // El modelo puede citar los mismos hechos en otro orden en la corrida
  // siguiente; eso no la vuelve otra recomendación.
  const a = recommendationFingerprint("gasto", ["b.uno", "a.dos"]);
  const b = recommendationFingerprint("gasto", ["a.dos", "b.uno"]);
  assert.strictEqual(a, b);
});

test("fingerprint: mayúsculas y espacios del tipo no la cambian", () => {
  assert.strictEqual(
    recommendationFingerprint("  Presupuesto ", ["x"]),
    recommendationFingerprint("presupuesto", ["x"])
  );
});

test("fingerprint: un hecho citado dos veces cuenta una", () => {
  assert.strictEqual(recommendationFingerprint("t", ["x", "x"]), recommendationFingerprint("t", ["x"]));
});

test("fingerprint: distinto tipo o distintos hechos, distinta huella", () => {
  const base = recommendationFingerprint("presupuesto", ["a"]);
  assert.notStrictEqual(base, recommendationFingerprint("gasto", ["a"]));
  assert.notStrictEqual(base, recommendationFingerprint("presupuesto", ["b"]));
  assert.notStrictEqual(base, recommendationFingerprint("presupuesto", ["a", "b"]));
});

test("fingerprint: cabe en la columna y es estable en longitud", () => {
  const f = recommendationFingerprint("presupuesto", ["budget.overrun.alimentos", "income.unassigned"]);
  assert.strictEqual(f.length, 32);
  assert.match(f, /^[0-9a-f]+$/);
});

// --- Estados ---------------------------------------------------------------

test("estados: son exactamente los siete de la tabla", () => {
  assert.strictEqual(ALL_STATUSES.length, 7);
});

test("estados: desde Presented se puede aceptar, editar, descartar, silenciar y reportar", () => {
  assert.deepStrictEqual(nextStatuses("Presented"), ["Accepted", "Edited", "Dismissed", "Suppressed", "Reported"]);
});

test("estados: Applied y Reported son terminales", () => {
  assert.deepStrictEqual(nextStatuses("Applied"), []);
  assert.deepStrictEqual(nextStatuses("Reported"), []);
});

test("estados: descartar no es definitivo, silenciar sí lo es desde la bandeja", () => {
  // "Esta vez no" tiene que poder volver; "no me la muestres más", no.
  assert.ok(canTransition("Dismissed", "Suppressed"));
  assert.ok(!canTransition("Suppressed", "Presented"));
});

test("estados: no se puede aplicar algo que nadie revisó", () => {
  assert.ok(!canTransition("Presented", "Applied"));
});

test("estados: solo Suppressed y Reported alimentan el contexto de rechazos", () => {
  const alimentan = ALL_STATUSES.filter((s: RecommendationStatus) => feedsRejectionContext(s));
  assert.deepStrictEqual(alimentan, ["Suppressed", "Reported"]);
});

// --- Memoria ---------------------------------------------------------------

function mem(id: string, scope: MemoryScope, validUntil: string | null = null): MemoryItemLike {
  return { id, scope, origin: "user", text: `nota ${id}`, validUntil };
}

test("memoria: una nota sin fecha no caduca", () => {
  assert.strictEqual(isExpired(mem("m1", "preference"), "2030-01-01"), false);
});

test("memoria: caduca el día DESPUÉS de su vigencia, no el mismo día", () => {
  const item = mem("m1", "finance", "2026-08-24");
  assert.strictEqual(isExpired(item, "2026-08-24"), false, "el último día todavía vale");
  assert.strictEqual(isExpired(item, "2026-08-25"), true);
});

test("memoria: las caducadas no entran al contexto", () => {
  const items = [mem("viva", "finance"), mem("muerta", "finance", "2026-01-01")];
  assert.deepStrictEqual(activeMemory(items, "money", "2026-08-24").map((m) => m.id), ["viva"]);
});

test("memoria: para money mandan finance, decision y preference", () => {
  const items = [mem("habito", "habit"), mem("finanza", "finance"), mem("preferencia", "preference")];
  const ids = activeMemory(items, "money", "2026-08-24").map((m) => m.id);
  assert.deepStrictEqual(ids.slice(0, 2), ["finanza", "preferencia"], "lo relevante va primero");
  assert.ok(ids.includes("habito"), "lo demás no se tira, solo baja de prioridad");
});

test("memoria: las decisiones y preferencias aplican a cualquier ámbito", () => {
  const items = [mem("decision", "decision")];
  for (const scope of ["money", "debt", "habits", "time", "execution", "global"]) {
    assert.strictEqual(activeMemory(items, scope, "2026-08-24").length, 1, `falló en ${scope}`);
  }
});

test("memoria: se recorta al tope y lo relevante sobrevive al recorte", () => {
  const ruido = Array.from({ length: MAX_MEMORY_ITEMS + 5 }, (_, i) => mem(`ruido${i}`, "habit"));
  const relevante = mem("clave", "finance");
  const salida = activeMemory([...ruido, relevante], "money", "2026-08-24");
  assert.strictEqual(salida.length, MAX_MEMORY_ITEMS);
  assert.strictEqual(salida[0].id, "clave");
});

test("memoria: un ámbito desconocido no revienta ni inventa relevancia", () => {
  const salida = activeMemory([mem("m1", "finance")], "inexistente", "2026-08-24");
  assert.strictEqual(salida.length, 1);
});
