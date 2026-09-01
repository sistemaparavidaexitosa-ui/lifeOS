import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultQuincenas,
  budgetTabRow,
  budgetQuincenaRow,
  carryoverOffered,
  totalSpentInRange,
  totalIncomeInRange
} from "../../src/lib/domain/budget.ts";
import { quincenaFor, monthRangeOf } from "../../src/lib/domain/quincena.ts";

const AGOSTO = monthRangeOf(quincenaFor("2026-08-10"));
const Q1 = quincenaFor("2026-08-05");
const Q2 = quincenaFor("2026-08-20");

function gasto(id: string, category: string, date: string, amount: number, status: "Posted" | "Reconciled" | "Reversed" = "Posted") {
  return {
    id,
    type: "expense" as const,
    date,
    category,
    status,
    lines: [{ account: "acc1", amount: -amount }]
  };
}

test("defaultQuincenas: divide el costo mensual en dos mitades iguales (A-010)", () => {
  const r = defaultQuincenas(5000);
  assert.strictEqual(r.q1Amount, 2500);
  assert.strictEqual(r.q2Amount, 2500);
});

// ---------------------------------------------------------------------------
// Fila MENSUAL (resumen del mes, Home)
// ---------------------------------------------------------------------------

test("budgetTabRow: el restante mensual es costo mensual − gasto del mes", () => {
  const line = { id: "b1", category: "Alimentación", monthlyCost: 5000, q1Amount: 2500, q2Amount: 2500 };
  const row = budgetTabRow(line, [gasto("j1", "Alimentación", "2026-08-05", 1200, "Reconciled")], AGOSTO);
  assert.strictEqual(row.spent, 1200);
  assert.strictEqual(row.balance, 3800);
});

test("budgetTabRow: cuenta gastos Posted además de Reconciled", () => {
  const line = { id: "b1", category: "Ocio", monthlyCost: 1000, q1Amount: 500, q2Amount: 500 };
  const row = budgetTabRow(line, [gasto("j2", "Ocio", "2026-08-05", 900)], AGOSTO);
  assert.strictEqual(row.spent, 900);
  assert.strictEqual(row.balance, 100);
});

test("budgetTabRow: ignora entradas Reversed", () => {
  const line = { id: "b1", category: "Salud", monthlyCost: 800, q1Amount: 400, q2Amount: 400 };
  const row = budgetTabRow(line, [gasto("j4", "Salud", "2026-08-03", 800, "Reversed")], AGOSTO);
  assert.strictEqual(row.spent, 0);
});

test("budgetTabRow: el mes tiene tope superior — no cuenta gasto del mes siguiente", () => {
  const line = { id: "b1", category: "Ocio", monthlyCost: 1000, q1Amount: 500, q2Amount: 500 };
  const entries = [gasto("j5", "Ocio", "2026-08-31", 300), gasto("j6", "Ocio", "2026-09-01", 700)];
  const row = budgetTabRow(line, entries, AGOSTO);
  assert.strictEqual(row.spent, 300);
});

// ---------------------------------------------------------------------------
// Fila QUINCENAL (lo que el usuario mira día a día)
// ---------------------------------------------------------------------------

test("budgetQuincenaRow: el gasto se atribuye a la quincena en la que cae, no al acumulado", () => {
  const line = { id: "b1", category: "Despensa", monthlyCost: 5000, q1Amount: 2500, q2Amount: 2500 };
  const entries = [gasto("j1", "Despensa", "2026-08-05", 1800), gasto("j2", "Despensa", "2026-08-20", 600)];

  const q1 = budgetQuincenaRow(line, entries, Q1, 0);
  assert.strictEqual(q1.spent, 1800);
  assert.strictEqual(q1.remaining, 700);

  const q2 = budgetQuincenaRow(line, entries, Q2, 0);
  assert.strictEqual(q2.spent, 600);
  assert.strictEqual(q2.remaining, 1900);
});

test("budgetQuincenaRow: la aportación disponible es la de la mitad correspondiente", () => {
  const line = { id: "b1", category: "Renta", monthlyCost: 6000, q1Amount: 4000, q2Amount: 2000 };
  assert.strictEqual(budgetQuincenaRow(line, [], Q1, 0).planned, 4000);
  assert.strictEqual(budgetQuincenaRow(line, [], Q2, 0).planned, 2000);
});

test("budgetQuincenaRow: sin arrastre aplicado la quincena arranca limpia (D-076)", () => {
  const line = { id: "b1", category: "Despensa", monthlyCost: 5000, q1Amount: 2500, q2Amount: 2500 };
  // Q1 se excedió 500, pero el usuario no aplicó nada: Q2 conserva su aportación íntegra.
  const entries = [gasto("j1", "Despensa", "2026-08-05", 3000)];
  const row = budgetQuincenaRow(line, entries, Q2, 0);
  assert.strictEqual(row.available, 2500);
  assert.strictEqual(row.carryIn, 0);
});

test("budgetQuincenaRow: un arrastre positivo aplicado aumenta el disponible", () => {
  const line = { id: "b1", category: "Despensa", monthlyCost: 5000, q1Amount: 2500, q2Amount: 2500 };
  const row = budgetQuincenaRow(line, [gasto("j2", "Despensa", "2026-08-20", 1000)], Q2, 700);
  assert.strictEqual(row.available, 3200);
  assert.strictEqual(row.remaining, 2200);
});

test("budgetQuincenaRow: un arrastre negativo aplicado reduce el disponible", () => {
  const line = { id: "b1", category: "Ocio", monthlyCost: 2000, q1Amount: 1000, q2Amount: 1000 };
  const row = budgetQuincenaRow(line, [], Q2, -300);
  assert.strictEqual(row.available, 700);
  assert.strictEqual(row.remaining, 700);
});

test("budgetQuincenaRow: el remanente de una quincena es el arrastre que se ofrece a la siguiente", () => {
  const line = { id: "b1", category: "Despensa", monthlyCost: 5000, q1Amount: 2500, q2Amount: 2500 };
  const entries = [gasto("j1", "Despensa", "2026-08-05", 1800)];
  assert.strictEqual(budgetQuincenaRow(line, entries, Q1, 0).remaining, 700);
});

test("budgetQuincenaRow: status ok / warn / over según el porcentaje consumido", () => {
  const line = { id: "b1", category: "Ocio", monthlyCost: 2000, q1Amount: 1000, q2Amount: 1000 };
  assert.strictEqual(budgetQuincenaRow(line, [gasto("a", "Ocio", "2026-08-20", 500)], Q2, 0).status, "ok");
  assert.strictEqual(budgetQuincenaRow(line, [gasto("b", "Ocio", "2026-08-20", 900)], Q2, 0).status, "warn");
  assert.strictEqual(budgetQuincenaRow(line, [gasto("c", "Ocio", "2026-08-20", 1000)], Q2, 0).status, "warn");
  assert.strictEqual(budgetQuincenaRow(line, [gasto("d", "Ocio", "2026-08-20", 1100)], Q2, 0).status, "over");
});

test("budgetQuincenaRow: un concepto sin disponible pero con gasto está excedido, no en cero", () => {
  const line = { id: "b1", category: "Ocio", monthlyCost: 0, q1Amount: 0, q2Amount: 0 };
  const row = budgetQuincenaRow(line, [gasto("a", "Ocio", "2026-08-20", 400)], Q2, 0);
  assert.strictEqual(row.status, "over");
  assert.strictEqual(row.remaining, -400);
  assert.strictEqual(row.pct, 100);
});

test("budgetQuincenaRow: no cuenta el gasto de otra categoría", () => {
  const line = { id: "b1", category: "Despensa", monthlyCost: 2000, q1Amount: 1000, q2Amount: 1000 };
  const row = budgetQuincenaRow(line, [gasto("a", "Farmacia", "2026-08-20", 900)], Q2, 0);
  assert.strictEqual(row.spent, 0);
});

// ---------------------------------------------------------------------------
// Qué se OFRECE arrastrar de la quincena anterior
// ---------------------------------------------------------------------------

test("carryoverOffered: ofrece el remanente de la quincena anterior", () => {
  const line = { id: "b1", category: "Despensa", monthlyCost: 5000, q1Amount: 2500, q2Amount: 2500 };
  const entries = [gasto("j1", "Despensa", "2026-08-05", 1800)];
  assert.strictEqual(carryoverOffered(line, entries, Q1, 0, "2026-07-01"), 700);
});

test("carryoverOffered: ofrece el exceso en negativo cuando la quincena anterior se pasó", () => {
  const line = { id: "b1", category: "Despensa", monthlyCost: 5000, q1Amount: 2500, q2Amount: 2500 };
  const entries = [gasto("j1", "Despensa", "2026-08-05", 3000)];
  assert.strictEqual(carryoverOffered(line, entries, Q1, 0, "2026-07-01"), -500);
});

test("carryoverOffered: un concepto creado después de esa quincena no arrastra nada", () => {
  // Sin esta guarda, un concepto nuevo ofrecería arrastrar la aportación íntegra
  // de una quincena en la que todavía no existía.
  const line = { id: "b1", category: "Despensa", monthlyCost: 5000, q1Amount: 2500, q2Amount: 2500 };
  assert.strictEqual(carryoverOffered(line, [], Q1, 0, "2026-08-20"), 0);
});

test("carryoverOffered: un concepto creado dentro de esa quincena sí arrastra su cierre", () => {
  const line = { id: "b1", category: "Despensa", monthlyCost: 5000, q1Amount: 2500, q2Amount: 2500 };
  const entries = [gasto("j1", "Despensa", "2026-08-10", 2000)];
  assert.strictEqual(carryoverOffered(line, entries, Q1, 0, "2026-08-08"), 500);
});

// ---------------------------------------------------------------------------
// Totales de la quincena (el indicador de arriba: cuánto llevas gastado)
// ---------------------------------------------------------------------------

test("totalSpentInRange: suma el gasto de TODAS las categorías de la quincena, presupuestadas o no", () => {
  const entries = [
    gasto("a", "Despensa", "2026-08-20", 3000),
    gasto("b", "Farmacia", "2026-08-22", 900),
    gasto("c", "Despensa", "2026-08-05", 1800) // Q1: fuera del rango
  ];
  assert.strictEqual(totalSpentInRange(entries, Q2), 3900);
});

test("totalSpentInRange: ignora los movimientos revertidos", () => {
  const entries = [gasto("a", "Despensa", "2026-08-20", 3000), gasto("b", "Ocio", "2026-08-21", 500, "Reversed")];
  assert.strictEqual(totalSpentInRange(entries, Q2), 3000);
});

test("totalIncomeInRange: suma el ingreso registrado en la quincena, para contrastarlo con el declarado", () => {
  const ingreso = (id: string, date: string, amount: number) => ({
    id,
    type: "income" as const,
    date,
    category: null,
    status: "Posted" as const,
    lines: [{ account: "acc1", amount }]
  });
  const entries = [
    ingreso("i1", "2026-08-16", 24300),
    ingreso("i2", "2026-08-02", 25000), // Q1: fuera del rango
    gasto("g", "Despensa", "2026-08-20", 3000)
  ];
  assert.strictEqual(totalIncomeInRange(entries, Q2), 24300);
});
