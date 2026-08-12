import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateDebt, simulateSingleDebt } from "../../src/lib/domain/debt.ts";

const debts = [
  { id: "d1", name: "Tarjeta", balance: 24000, rate: 36, minPayment: 1200 },
  { id: "d2", name: "Auto", balance: 78000, rate: 14, minPayment: 3200 }
];

test("simulateDebt: avalancha ordena por tasa descendente (mayor interés primero)", () => {
  const r = simulateDebt(debts, "avalanche", 1000);
  assert.deepStrictEqual(r.order, ["Tarjeta", "Auto"]); // Tarjeta tiene tasa 36% > Auto 14%
  assert.ok(r.months > 0);
  assert.ok(r.interest >= 0);
});

test("simulateDebt: bola de nieve ordena por saldo ascendente (menor saldo primero)", () => {
  const r = simulateDebt(debts, "snowball", 1000);
  assert.deepStrictEqual(r.order, ["Tarjeta", "Auto"]); // Tarjeta 24000 < Auto 78000
});

test("simulateDebt: cash flow first ordena por pago mínimo ascendente", () => {
  const r = simulateDebt(debts, "cashflow", 1000);
  assert.deepStrictEqual(r.order, ["Tarjeta", "Auto"]); // 1200 < 3200
});

test("simulateDebt: IA Optimizada elige el método de menor interés y es explicable (FR-DEB-005)", () => {
  const r = simulateDebt(debts, "ai", 1000);
  assert.ok(r.chosen, "debe declarar qué método eligió");
  assert.ok(r.rationale && r.rationale.length > 0, "debe traer justificación textual");
  assert.match(r.rationale!, /no ejecuta pagos/);
});

test("simulateDebt: no ejecuta pagos reales — el resultado es puramente informativo (no muta `debts`)", () => {
  const before = JSON.stringify(debts);
  simulateDebt(debts, "avalanche", 5000);
  assert.strictEqual(JSON.stringify(debts), before, "la simulación no debe mutar el arreglo original");
});

test("simulateSingleDebt: a mayor aportación, menos meses (FR-DEB-008)", () => {
  const target = debts[0]!;
  const low = simulateSingleDebt(target, 1200);
  const high = simulateSingleDebt(target, 3000);
  assert.ok(high.months < low.months);
  assert.ok(high.interest < low.interest);
});
