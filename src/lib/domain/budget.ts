// Pestaña de Presupuesto tabular — FR-MNY-018/019, BR-028, A-010.
// Reutiliza la entidad budgets extendida (monthlyCost/q1Amount/q2Amount);
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
  /** Gasto real del concepto en el ciclo vigente (Posted + Reconciled, excluye Reversed). */
  spent: number;
  /**
   * Restante = costo mensual − gasto. Se conserva para el Home ("Presupuesto
   * restante", getHomeData) y su semántica NO cambia.
   */
  balance: number;
  /**
   * PUNTO 4: columna "Balance" de la pestaña de Presupuesto = suma de gastos −
   * costo mensual del ítem. Antes la columna reflejaba de facto solo las
   * aportaciones (Q1+Q2 = costo mensual) porque el gasto no se estaba
   * contabilizando (solo se contaba status = 'Reconciled', y los movimientos
   * se registran como 'Posted'). Ahora se cuentan Posted + Reconciled, así el
   * gasto sí impacta la columna.
   */
  expenseVsBudget: number;
}

/**
 * FIX PUNTO 4 (BR-028 ajustado a la petición del usuario):
 *   - \`spent\` ahora suma TODOS los gastos del concepto en el ciclo que NO estén
 *     revertidos (Posted + Reconciled), no solo los conciliados. Esto corrige
 *     que la columna Balance "solo reflejaba las aportaciones".
 *   - \`expenseVsBudget\` = gasto − costo mensual (lo que la pestaña de
 *     Presupuesto muestra ahora en la columna Balance).
 *   - \`balance\` = costo mensual − gasto (restante) se mantiene para el Home.
 */
export function budgetTabRow(
  line: BudgetLine,
  entries: JournalEntryLike[],
  cycleFromISO: string
): BudgetTabRow {
  const spent = round2(
    entries
      .filter(
        (e) => e.status !== "Reversed" && e.type === "expense" && e.date >= cycleFromISO && e.category === line.category
      )
      .reduce((sum, e) => sum + e.lines.reduce((s, l) => s + Math.max(0, -l.amount), 0), 0)
  );
  return {
    id: line.id,
    category: line.category,
    monthlyCost: line.monthlyCost,
    q1Amount: line.q1Amount,
    q2Amount: line.q2Amount,
    spent,
    balance: round2(line.monthlyCost - spent),
    expenseVsBudget: round2(spent - line.monthlyCost)
  };
}
