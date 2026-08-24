// tests/domain/insights-anchoring.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAnchoring, type DraftRecommendation } from "../../src/lib/domain/insights/anchoring.ts";

function draft(over: Partial<DraftRecommendation> = {}): DraftRecommendation {
  return {
    type: "budget",
    text: "Alimentos va 2400 por encima del presupuesto.",
    confidence: "Alta",
    impact: "Medio",
    factIds: ["budget.overrun.alimentos"],
    assumptions: [],
    ...over
  };
}

test("validateAnchoring: conserva la que cita hechos reales", () => {
  const r = validateAnchoring([draft()], ["budget.overrun.alimentos"]);
  assert.strictEqual(r.kept.length, 1);
  assert.strictEqual(r.dropped.length, 0);
});

test("validateAnchoring: descarta la que cita un hecho inexistente", () => {
  // El caso que importa: el modelo inventó una cifra y la colgó de un id falso.
  const r = validateAnchoring([draft({ factIds: ["budget.overrun.viajes"] })], ["budget.overrun.alimentos"]);
  assert.strictEqual(r.kept.length, 0);
  assert.match(r.dropped[0].reason, /budget\.overrun\.viajes/);
});

test("validateAnchoring: basta con que UNO de los hechos citados sea falso", () => {
  const r = validateAnchoring(
    [draft({ factIds: ["budget.overrun.alimentos", "inventado"] })],
    ["budget.overrun.alimentos"]
  );
  assert.strictEqual(r.kept.length, 0);
});

test("validateAnchoring: descarta la que no cita nada", () => {
  const r = validateAnchoring([draft({ factIds: [] })], ["budget.overrun.alimentos"]);
  assert.strictEqual(r.kept.length, 0);
  assert.match(r.dropped[0].reason, /no cita/);
});

test("validateAnchoring: descarta el texto vacío", () => {
  const r = validateAnchoring([draft({ text: "   " })], ["budget.overrun.alimentos"]);
  assert.strictEqual(r.kept.length, 0);
});

test("validateAnchoring: una mala no tumba a las buenas", () => {
  const r = validateAnchoring(
    [draft({ text: "buena" }), draft({ text: "mala", factIds: ["fantasma"] }), draft({ text: "otra buena" })],
    ["budget.overrun.alimentos"]
  );
  assert.deepStrictEqual(r.kept.map((k) => k.text), ["buena", "otra buena"]);
  assert.strictEqual(r.dropped.length, 1);
});

test("validateAnchoring: sin hechos en el contexto no sobrevive ninguna", () => {
  const r = validateAnchoring([draft()], []);
  assert.strictEqual(r.kept.length, 0);
});
