// Pestaña de Presupuesto tabular — FR-MNY-018/019, BR-028, A-010.
// Reutiliza la entidad `budgets` extendida (monthlyCost/q1Amount/q2Amount);
// NUNCA crear una entidad de presupuesto paralela (ver /docs/DECISIONS.md D-003).

import type { BudgetLine, JournalEntryLike } from "./types.ts";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A-010: por defecto Q1 y Q2 son la mitad del costo mensual. */
export function defaultQuincenas(monthlyCost: number): { q1Amount: number; q2Amount: number } {
  const half = round2(monthlyCost / 2);
  return { q1Amount: half, q2Amount: half };
}

export interface BudgetTabRow {
  id: string;
  category: string;
  monthlyCost: number;
  q1Amount: number;
  q2Amount: number;
  reconciledSpent: number;
  balance: number;
}

/**
 * BR-028: Balance = costo mensual − gasto CONCILIADO del concepto en el ciclo
 * vigente (`from` inclusive). Solo cuentan gastos con status "Reconciled".
 */
export function budgetTabRow(
  line: BudgetLine,
  entries: JournalEntryLike[],
  cycleFromISO: string
): BudgetTabRow {
  const reconciledSpent = round2(
    entries
      .filter(
        (e) => e.status === "Reconciled" && e.type === "expense" && e.date >= cycleFromISO && e.category === line.category
      )
      .reduce((sum, e) => sum + e.lines.reduce((s, l) => s + Math.max(0, -l.amount), 0), 0)
  );
  const balance = round2(line.monthlyCost - reconciledSpent);
  return {
    id: line.id,
    category: line.category,
    monthlyCost: line.monthlyCost,
    q1Amount: line.q1Amount,
    q2Amount: line.q2Amount,
    reconciledSpent,
    balance
  };
}
