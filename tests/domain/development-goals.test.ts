// tests/domain/development-goals.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  keyResultProgress,
  goalProgress,
  goalAtRisk,
  type KeyResultLike,
  type SourceSnapshot
} from "../../src/lib/domain/development/goals.ts";

const EMPTY: SourceSnapshot = {
  habitCompletionPct: {},
  projectDonePct: {},
  bookPagesRead: {},
  financialGoalAmount: {},
  savingsGoalAmount: {}
};

function kr(over: Partial<KeyResultLike> = {}): KeyResultLike {
  return { id: "k1", sourceKind: "manual", sourceId: null, target: 10, manualCurrent: 0, ...over };
}

test("keyResultProgress: fuente manual usa manual_current", () => {
  const r = keyResultProgress(kr({ manualCurrent: 5, target: 10 }), EMPTY);
  assert.deepStrictEqual(r, { current: 5, target: 10, pct: 50, stale: false });
});

test("keyResultProgress: fuente hábito lee el % de cumplimiento", () => {
  const sources: SourceSnapshot = { ...EMPTY, habitCompletionPct: { h1: 60 } };
  const r = keyResultProgress(kr({ sourceKind: "habit", sourceId: "h1", target: 80 }), sources);
  assert.strictEqual(r.current, 60);
  assert.strictEqual(r.pct, 75); // 60 de 80
  assert.strictEqual(r.stale, false);
});

test("keyResultProgress: fuente borrada devuelve stale, no un 0% que parece dato real", () => {
  const r = keyResultProgress(kr({ sourceKind: "book", sourceId: "b-borrado", target: 300 }), EMPTY);
  assert.strictEqual(r.stale, true);
  assert.strictEqual(r.pct, 0);
});

test("keyResultProgress: fuente ahorro lee el monto acumulado (migración 0035)", () => {
  const sources: SourceSnapshot = { ...EMPTY, savingsGoalAmount: { s1: 25000 } };
  const r = keyResultProgress(kr({ sourceKind: "savings_goal", sourceId: "s1", target: 50000 }), sources);
  assert.strictEqual(r.current, 25000);
  assert.strictEqual(r.pct, 50);
  assert.strictEqual(r.stale, false);
});

test("keyResultProgress: un ahorro NO se confunde con una meta financiera del mismo id", () => {
  // Antes había un `else` al final de la cadena de ternarios: una fuente nueva
  // sin rama caía en financialGoalAmount y mostraba el número de otra cosa.
  const sources: SourceSnapshot = { ...EMPTY, financialGoalAmount: { x1: 999 }, savingsGoalAmount: { x1: 100 } };
  const r = keyResultProgress(kr({ sourceKind: "savings_goal", sourceId: "x1", target: 200 }), sources);
  assert.strictEqual(r.current, 100, "debe leer el ahorro, no la meta financiera");
});

test("keyResultProgress: un ahorro borrado devuelve stale, igual que las demás fuentes", () => {
  const r = keyResultProgress(kr({ sourceKind: "savings_goal", sourceId: "s-borrado", target: 100 }), EMPTY);
  assert.strictEqual(r.stale, true);
  assert.strictEqual(r.pct, 0);
});

test("keyResultProgress: acota el porcentaje a 100 aunque se rebase la meta", () => {
  const r = keyResultProgress(kr({ manualCurrent: 30, target: 10 }), EMPTY);
  assert.strictEqual(r.pct, 100);
});

test("keyResultProgress: meta en cero no divide entre cero", () => {
  const r = keyResultProgress(kr({ manualCurrent: 5, target: 0 }), EMPTY);
  assert.strictEqual(r.pct, 0);
});

test("goalProgress: promedio simple de los resultados clave", () => {
  assert.strictEqual(goalProgress([
    { current: 0, target: 0, pct: 100, stale: false },
    { current: 0, target: 0, pct: 50, stale: false }
  ]), 75);
});

test("goalProgress: una meta sin resultados clave va en 0, no en NaN", () => {
  assert.strictEqual(goalProgress([]), 0);
});

test("goalAtRisk: 65% del horizonte transcurrido con 40% de avance está en riesgo", () => {
  // 2026-01-01 a 2026-12-31 = 364 días; 2026-08-22 = día 233 (64%)
  assert.strictEqual(goalAtRisk("2026-01-01", "2026-12-31", 40, "2026-08-22"), true);
});

test("goalAtRisk: avance a la par del calendario no está en riesgo", () => {
  assert.strictEqual(goalAtRisk("2026-01-01", "2026-12-31", 64, "2026-08-22"), false);
});

test("goalAtRisk: el primer día nunca está en riesgo", () => {
  assert.strictEqual(goalAtRisk("2026-08-22", "2026-12-31", 0, "2026-08-22"), false);
});

test("goalAtRisk: horizonte vencido sin completar está en riesgo", () => {
  // El calendario va en 100% (el horizonte ya pasó) y el avance en 70%.
  assert.strictEqual(goalAtRisk("2026-01-01", "2026-06-30", 70, "2026-08-22"), true);
});

test("goalAtRisk: el umbral es estricto — exactamente 20 puntos de atraso todavía no es riesgo", () => {
  assert.strictEqual(goalAtRisk("2026-01-01", "2026-06-30", 80, "2026-08-22"), false);
});

// --- Fuente de nutrición y metas DESCENDENTES (0047) --------------------------
// «Bajar a 78 kg» es la primera fuente del sistema donde el objetivo está POR
// DEBAJO del valor actual. Con la fórmula de las metas ascendentes, 82/78 da
// 105 % y se recorta a 100: la meta nacería cumplida.

const SNAPSHOT_NUTRICION: SourceSnapshot = {
  habitCompletionPct: {},
  projectDonePct: {},
  bookPagesRead: {},
  financialGoalAmount: {},
  savingsGoalAmount: {},
  nutritionAdherencePct: { u1: 62 },
  bodyWeightKg: { u1: 81 }
};

test("keyResultProgress: la adherencia de nutrición se lee como cualquier otra fuente ascendente", () => {
  const kr = {
    id: "k1",
    sourceKind: "nutrition" as const,
    sourceId: "u1",
    sourceMetric: "adherencia" as const,
    baseline: null,
    target: 80,
    manualCurrent: 0
  };
  const p = keyResultProgress(kr, SNAPSHOT_NUTRICION);
  assert.strictEqual(p.current, 62);
  assert.strictEqual(p.pct, 78);
});

test("keyResultProgress: una meta de peso NO nace cumplida por estar el objetivo por debajo", () => {
  const kr = {
    id: "k2",
    sourceKind: "nutrition" as const,
    sourceId: "u1",
    sourceMetric: "peso" as const,
    baseline: 85,
    target: 78,
    manualCurrent: 0
  };
  // De 85 a 78 son 7 kg; lleva 4 (85→81). Eso es un 57 %, no un 100 %.
  const p = keyResultProgress(kr, SNAPSHOT_NUTRICION);
  assert.strictEqual(p.current, 81);
  assert.strictEqual(p.pct, 57);
});

test("keyResultProgress: una meta descendente ya alcanzada llega a 100 y no se pasa", () => {
  const kr = {
    id: "k3",
    sourceKind: "nutrition" as const,
    sourceId: "u1",
    sourceMetric: "peso" as const,
    baseline: 85,
    target: 82,
    manualCurrent: 0
  };
  assert.strictEqual(keyResultProgress(kr, SNAPSHOT_NUTRICION).pct, 100);
});

test("keyResultProgress: sin perfil corporal la meta de nutrición queda stale, como un libro borrado", () => {
  const kr = {
    id: "k4",
    sourceKind: "nutrition" as const,
    sourceId: "otro-usuario",
    sourceMetric: "adherencia" as const,
    baseline: null,
    target: 80,
    manualCurrent: 0
  };
  assert.strictEqual(keyResultProgress(kr, SNAPSHOT_NUTRICION).stale, true);
});

test("keyResultProgress: una meta de peso SIN línea base no se inventa el progreso, se declara stale", () => {
  const kr = {
    id: "k5",
    sourceKind: "nutrition" as const,
    sourceId: "u1",
    sourceMetric: "peso" as const,
    baseline: null,
    target: 78,
    manualCurrent: 0
  };
  assert.strictEqual(keyResultProgress(kr, SNAPSHOT_NUTRICION).stale, true);
});
