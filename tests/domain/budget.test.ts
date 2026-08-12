import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultQuincenas, budgetTabRow } from "../../src/lib/domain/budget.ts";

test("defaultQuincenas: divide el costo mensual en dos mitades iguales (A-010)", () => {
  const r = defaultQuincenas(5000);
  assert.strictEqual(r.q1Amount, 2500);
  assert.strictEqual(r.q2Amount, 2500);
});

test("budgetTabRow: balance = monthlyCost - gasto conciliado del ciclo (BR-028)", () => {
  const line = { id: "b1", category: "Alimentación", monthlyCost: 5000, q1Amount: 2500, q2Amount: 2500 };
  const entries = [
    {
      id: "j1",
      type: "expense" as const,
      date: "2026-08-05",
      category: "Alimentación",
      status: "Reconciled" as const,
      lines: [{ account: "acc1", amount: -1200 }]
    }
  ];
  const row = budgetTabRow(line, entries, "2026-08-01");
  assert.strictEqual(row.reconciledSpent, 1200);
  assert.strictEqual(row.balance, 3800);
});

test("budgetTabRow: ignora gastos NO conciliados (solo status=Reconciled cuenta)", () => {
  const line = { id: "b1", category: "Ocio", monthlyCost: 1000, q1Amount: 500, q2Amount: 500 };
  const entries = [
    {
      id: "j2",
      type: "expense" as const,
      date: "2026-08-05",
      category: "Ocio",
      status: "Posted" as const,
      lines: [{ account: "acc1", amount: -900 }]
    }
  ];
  const row = budgetTabRow(line, entries, "2026-08-01");
  assert.strictEqual(row.reconciledSpent, 0);
  assert.strictEqual(row.balance, 1000);
});

test("budgetTabRow: balance negativo cuando se excede el costo mensual", () => {
  const line = { id: "b1", category: "Transporte", monthlyCost: 500, q1Amount: 250, q2Amount: 250 };
  const entries = [
    {
      id: "j3",
      type: "expense" as const,
      date: "2026-08-03",
      category: "Transporte",
      status: "Reconciled" as const,
      lines: [{ account: "acc1", amount: -900 }]
    }
  ];
  const row = budgetTabRow(line, entries, "2026-08-01");
  assert.ok(row.balance < 0, "balance debe ser negativo cuando se excede lo planeado");
  assert.strictEqual(row.balance, -400);
});

test("budgetTabRow: ignora entradas Reversed", () => {
  const line = { id: "b1", category: "Salud", monthlyCost: 800, q1Amount: 400, q2Amount: 400 };
  const entries = [
    {
      id: "j4",
      type: "expense" as const,
      date: "2026-08-03",
      category: "Salud",
      status: "Reversed" as const,
      lines: [{ account: "acc1", amount: -800 }]
    }
  ];
  const row = budgetTabRow(line, entries, "2026-08-01");
  assert.strictEqual(row.reconciledSpent, 0);
});
