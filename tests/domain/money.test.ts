import { test } from "node:test";
import assert from "node:assert/strict";
import { accountBalance, periodStats, netWorth, applyDebtPayment, cashbackAccrued, savingsProjection, investmentReturnPct } from "../../src/lib/domain/money.ts";

test("accountBalance: suma saldo inicial + líneas de esa cuenta, ignora Reversed", () => {
  const entries = [
    { id: "j1", type: "income" as const, date: "2026-08-01", category: "Ingreso", status: "Posted" as const, lines: [{ account: "a1", amount: 1000 }] },
    { id: "j2", type: "expense" as const, date: "2026-08-02", category: "Otros", status: "Posted" as const, lines: [{ account: "a1", amount: -200 }] },
    { id: "j3", type: "expense" as const, date: "2026-08-03", category: "Otros", status: "Reversed" as const, lines: [{ account: "a1", amount: -500 }] }
  ];
  assert.strictEqual(accountBalance("a1", 100, entries), 900); // 100 + 1000 - 200 (j3 reversado no cuenta)
});

test("periodStats: una transferencia NO cuenta como ingreso ni gasto (BR-002)", () => {
  const entries = [
    {
      id: "j1",
      type: "transfer" as const,
      date: "2026-08-05",
      category: "Ahorro",
      status: "Posted" as const,
      lines: [
        { account: "a1", amount: -1000 },
        { account: "a2", amount: 1000 }
      ]
    }
  ];
  const stats = periodStats(entries, "2026-08-01");
  assert.strictEqual(stats.income, 0);
  assert.strictEqual(stats.expense, 0);
  assert.strictEqual(stats.transfers, 1000);
});

test("periodStats: calcula disponible = ingreso - gasto dentro del periodo", () => {
  const entries = [
    { id: "j1", type: "income" as const, date: "2026-08-05", category: "Ingreso", status: "Posted" as const, lines: [{ account: "a1", amount: 16000 }] },
    { id: "j2", type: "expense" as const, date: "2026-08-06", category: "Otros", status: "Posted" as const, lines: [{ account: "a1", amount: -1850 }] },
    { id: "j3", type: "income" as const, date: "2026-07-01", category: "Ingreso", status: "Posted" as const, lines: [{ account: "a1", amount: 999999 }] } // fuera del periodo
  ];
  const stats = periodStats(entries, "2026-08-01");
  assert.strictEqual(stats.income, 16000);
  assert.strictEqual(stats.expense, 1850);
  assert.strictEqual(stats.available, 14150);
});

test("periodStats: con tope superior no cuenta lo que cae después del periodo (quincena)", () => {
  const entries = [
    { id: "j1", type: "expense" as const, date: "2026-08-20", category: "Otros", status: "Posted" as const, lines: [{ account: "a1", amount: -500 }] },
    { id: "j2", type: "expense" as const, date: "2026-09-02", category: "Otros", status: "Posted" as const, lines: [{ account: "a1", amount: -800 }] }
  ];
  const stats = periodStats(entries, "2026-08-16", "2026-08-31");
  assert.strictEqual(stats.expense, 500);
});

test("periodStats: sin tope superior conserva el comportamiento abierto que usa /reports", () => {
  const entries = [
    { id: "j1", type: "expense" as const, date: "2026-08-20", category: "Otros", status: "Posted" as const, lines: [{ account: "a1", amount: -500 }] },
    { id: "j2", type: "expense" as const, date: "2026-09-02", category: "Otros", status: "Posted" as const, lines: [{ account: "a1", amount: -800 }] }
  ];
  assert.strictEqual(periodStats(entries, "2026-08-16").expense, 1300);
});

test("netWorth: activos - pasivos (BR-003)", () => {
  assert.strictEqual(netWorth(500000, 120000), 380000);
});

test("applyDebtPayment: reduce solo el saldo de la deuda referenciada (BR-024)", () => {
  const debt = { id: "d1", name: "Tarjeta", balance: 24000, rate: 36, minPayment: 1200 };
  const after = applyDebtPayment(debt, 1000);
  assert.strictEqual(after.balance, 23000);
  assert.strictEqual(debt.balance, 24000, "no debe mutar el objeto original (inmutable)");
});

test("applyDebtPayment: nunca deja saldo negativo", () => {
  const debt = { id: "d1", name: "Tarjeta", balance: 500, rate: 36, minPayment: 1200 };
  const after = applyDebtPayment(debt, 900);
  assert.strictEqual(after.balance, 0);
});

test("cashbackAccrued: estimado menos redenciones (BR-025)", () => {
  assert.strictEqual(cashbackAccrued(145.5, [50]), 95.5);
  assert.strictEqual(cashbackAccrued(145.5, []), 145.5);
});

test("savingsProjection: calcula meses restantes con aportación positiva", () => {
  const p = savingsProjection(150000, 42000, 5000);
  assert.strictEqual(p.remaining, 108000);
  assert.strictEqual(p.months, 22); // ceil(108000/5000) = 21.6 -> 22
  assert.strictEqual(p.pct, 28);
});

test("savingsProjection: months es Infinity si la aportación mensual es 0", () => {
  const p = savingsProjection(150000, 42000, 0);
  assert.strictEqual(p.months, Infinity);
});

test("savingsProjection: pct 100 y remaining 0 si ya se alcanzó la meta", () => {
  const p = savingsProjection(1000, 1000, 100);
  assert.strictEqual(p.pct, 100);
  assert.strictEqual(p.remaining, 0);
});

test("investmentReturnPct: rendimiento positivo y negativo (FR-INV-002)", () => {
  assert.strictEqual(investmentReturnPct(60000, 61200), 2);
  assert.strictEqual(investmentReturnPct(40000, 46800), 17);
  assert.strictEqual(investmentReturnPct(1000, 900), -10);
  assert.strictEqual(investmentReturnPct(0, 100), 0);
});
