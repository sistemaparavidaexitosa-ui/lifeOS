// tests/domain/insights-money.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { moneyFacts, type MoneySnapshot } from "../../src/lib/domain/insights/facts/money.ts";
import { clampWeight } from "../../src/lib/domain/insights/types.ts";
import type { JournalEntryLike } from "../../src/lib/domain/types.ts";

const CICLO = "2026-08-01";
const HOY = "2026-08-23";

function gasto(id: string, category: string, date: string, amount: number): JournalEntryLike {
  return { id, type: "expense", date, category, status: "Posted", lines: [{ account: "a1", amount: -amount }] };
}

function snapshot(over: Partial<MoneySnapshot> = {}): MoneySnapshot {
  return { budgets: [], entries: [], quincenalIncome: 0, cycleFromISO: CICLO, ...over };
}

test("clampWeight: acota a 0-1 y trata NaN como 0", () => {
  assert.strictEqual(clampWeight(-3), 0);
  assert.strictEqual(clampWeight(0.42), 0.42);
  assert.strictEqual(clampWeight(9), 1);
  assert.strictEqual(clampWeight(Number.NaN), 0);
});

test("moneyFacts: categoría excedida produce un hecho con el sobrante", () => {
  const s = snapshot({
    budgets: [{ id: "b1", category: "Alimentos", monthlyCost: 6000, q1Amount: 3000, q2Amount: 3000 }],
    entries: [gasto("e1", "Alimentos", "2026-08-10", 5000), gasto("e2", "Alimentos", "2026-08-15", 3400)]
  });
  const [fact] = moneyFacts(s, HOY);
  assert.strictEqual(fact.id, "budget.overrun.alimentos");
  assert.match(fact.label, /8400 gastado de 6000 presupuestado/);
  assert.match(fact.label, /2400 por encima/);
  assert.deepStrictEqual(fact.refs, [{ table: "budgets", id: "b1" }]);
});

test("moneyFacts: el peso mide cuánto se pasó, no cuánto gastó", () => {
  const mitad = moneyFacts(
    snapshot({
      budgets: [{ id: "b1", category: "Alimentos", monthlyCost: 1000, q1Amount: 0, q2Amount: 0 }],
      entries: [gasto("e1", "Alimentos", "2026-08-10", 1500)]
    }),
    HOY
  )[0];
  const doble = moneyFacts(
    snapshot({
      budgets: [{ id: "b1", category: "Alimentos", monthlyCost: 1000, q1Amount: 0, q2Amount: 0 }],
      entries: [gasto("e1", "Alimentos", "2026-08-10", 2000)]
    }),
    HOY
  )[0];
  assert.strictEqual(mitad.weight, 0.5);
  assert.strictEqual(doble.weight, 1);
});

test("moneyFacts: gastar justo el presupuesto no es un hecho", () => {
  const s = snapshot({
    budgets: [{ id: "b1", category: "Alimentos", monthlyCost: 6000, q1Amount: 0, q2Amount: 0 }],
    entries: [gasto("e1", "Alimentos", "2026-08-10", 6000)]
  });
  assert.deepStrictEqual(moneyFacts(s, HOY), []);
});

test("moneyFacts: un concepto sin presupuesto no está 'excedido'", () => {
  const s = snapshot({
    budgets: [{ id: "b1", category: "Alimentos", monthlyCost: 0, q1Amount: 0, q2Amount: 0 }],
    entries: [gasto("e1", "Alimentos", "2026-08-10", 3000)]
  });
  assert.strictEqual(moneyFacts(s, HOY).filter((f) => f.id.startsWith("budget.overrun")).length, 0);
});

test("moneyFacts: un gasto revertido no cuenta", () => {
  const revertido: JournalEntryLike = {
    id: "e2", type: "expense", date: "2026-08-11", category: "Alimentos", status: "Reversed",
    lines: [{ account: "a1", amount: -9000 }]
  };
  const s = snapshot({
    budgets: [{ id: "b1", category: "Alimentos", monthlyCost: 6000, q1Amount: 0, q2Amount: 0 }],
    entries: [gasto("e1", "Alimentos", "2026-08-10", 1000), revertido]
  });
  assert.deepStrictEqual(moneyFacts(s, HOY), []);
});

test("moneyFacts: detecta el gasto atípico contra el promedio de ciclos previos", () => {
  const s = snapshot({
    entries: [
      gasto("p1", "Transporte", "2026-07-10", 1000),
      gasto("p2", "Transporte", "2026-06-10", 1000),
      gasto("c1", "Transporte", "2026-08-05", 3000)
    ]
  });
  const [fact] = moneyFacts(s, HOY);
  assert.strictEqual(fact.id, "spend.spike.transporte");
  assert.match(fact.label, /3000 en el ciclo vigente contra un promedio de 1000/);
  assert.strictEqual(fact.weight, 1, "triplicar el promedio satura el peso");
});

test("moneyFacts: sin historial previo no se inventa un promedio", () => {
  const s = snapshot({ entries: [gasto("c1", "Transporte", "2026-08-05", 3000)] });
  assert.deepStrictEqual(moneyFacts(s, HOY), []);
});

test("moneyFacts: un gasto chico duplicado no genera ruido", () => {
  // Cierto pero inútil: duplicar 200 pesos no es una recomendación.
  const s = snapshot({
    entries: [gasto("p1", "Café", "2026-07-10", 100), gasto("c1", "Café", "2026-08-05", 400)]
  });
  assert.deepStrictEqual(moneyFacts(s, HOY), []);
});

test("moneyFacts: ingreso sin asignar cuando sobra más del 5%", () => {
  const s = snapshot({
    quincenalIncome: 10000, // 20000 al mes
    budgets: [{ id: "b1", category: "Alimentos", monthlyCost: 6000, q1Amount: 3000, q2Amount: 3000 }]
  });
  const fact = moneyFacts(s, HOY).find((f) => f.id === "income.unassigned");
  assert.ok(fact);
  assert.match(fact.label, /14000 de ingreso mensual sin asignar/);
  assert.strictEqual(fact.weight, 0.7);
});

test("moneyFacts: un sobrante de redondeo no es un hecho", () => {
  const s = snapshot({
    quincenalIncome: 10000,
    budgets: [{ id: "b1", category: "Todo", monthlyCost: 19500, q1Amount: 9750, q2Amount: 9750 }]
  });
  assert.strictEqual(moneyFacts(s, HOY).some((f) => f.id === "income.unassigned"), false);
});

test("moneyFacts: sin ingreso declarado no se opina sobre el ingreso", () => {
  const s = snapshot({ quincenalIncome: 0, budgets: [{ id: "b1", category: "X", monthlyCost: 100, q1Amount: 0, q2Amount: 0 }] });
  assert.strictEqual(moneyFacts(s, HOY).some((f) => f.id === "income.unassigned"), false);
});

test("moneyFacts: los hechos salen ordenados de más a menos anómalo", () => {
  const s = snapshot({
    quincenalIncome: 10000,
    budgets: [
      { id: "b1", category: "Alimentos", monthlyCost: 1000, q1Amount: 0, q2Amount: 0 },
      { id: "b2", category: "Renta", monthlyCost: 10000, q1Amount: 0, q2Amount: 0 }
    ],
    entries: [gasto("e1", "Alimentos", "2026-08-10", 2000), gasto("e2", "Renta", "2026-08-02", 10500)]
  });
  const pesos = moneyFacts(s, HOY).map((f) => f.weight);
  assert.deepStrictEqual([...pesos].sort((a, b) => b - a), pesos);
});

test("moneyFacts: los ids son estables y sin acentos", () => {
  const s = snapshot({
    budgets: [{ id: "b1", category: "Educación y libros", monthlyCost: 100, q1Amount: 0, q2Amount: 0 }],
    entries: [gasto("e1", "Educación y libros", "2026-08-10", 300)]
  });
  assert.strictEqual(moneyFacts(s, HOY)[0].id, "budget.overrun.educacion-y-libros");
});
