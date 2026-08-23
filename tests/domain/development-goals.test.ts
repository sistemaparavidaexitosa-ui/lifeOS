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
  financialGoalAmount: {}
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
