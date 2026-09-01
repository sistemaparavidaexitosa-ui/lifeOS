// Presupuesto — FR-MNY-018/019, BR-028, A-010, D-076.
// Reutiliza la entidad budgets extendida (monthlyCost/q1Amount/q2Amount);
// NUNCA crear una entidad de presupuesto paralela (ver /docs/DECISIONS.md D-003).
//
// D-076: el presupuesto se TRABAJA POR QUINCENA (el usuario cobra por quincena) y
// se RESUME por mes. Dos filas, dos propósitos, ninguna ambigüedad:
//   - budgetQuincenaRow() → lo que el usuario mira día a día: aportación de ESA
//     quincena (+ arrastre que él decidió aplicar) contra el gasto de ESA quincena.
//   - budgetTabRow()      → el resumen del mes: costo mensual contra gasto del mes.
//
// Antes existía una sola fila que comparaba el gasto de una ventana RODANTE de 15
// días contra el costo MENSUAL, y publicaba la misma idea con dos nombres de signo
// opuesto (`balance` = restante, `expenseVsBudget` = exceso). De ahí que el usuario
// viera un acumulado Q1+Q2 y que la columna "Balance" casi siempre saliera en verde.
// Ahora hay un solo significado de "restante": disponible − gasto, positivo = te queda.

import type { BudgetLine, JournalEntryLike } from "./types.ts";
import type { Quincena } from "./quincena.ts";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A-010: por defecto Q1 y Q2 son la mitad del costo mensual. */
export function defaultQuincenas(monthlyCost: number): { q1Amount: number; q2Amount: number } {
  const half = round2(monthlyCost / 2);
  return { q1Amount: half, q2Amount: half };
}

export interface DateRange {
  /** Primer día del periodo, inclusivo. */
  fromISO: string;
  /** Último día del periodo, inclusivo. */
  toISO: string;
}

/**
 * Gasto de una categoría dentro de un rango CERRADO por ambos extremos.
 * El tope superior importa: sin él, mirar una quincena pasada arrastraba el gasto
 * de todo lo que vino después. Cuenta Posted + Reconciled, excluye Reversed.
 */
function spentInRange(entries: JournalEntryLike[], category: string, range: DateRange): number {
  return round2(
    entries
      .filter(
        (e) =>
          e.status !== "Reversed" &&
          e.type === "expense" &&
          e.category === category &&
          e.date >= range.fromISO &&
          e.date <= range.toISO
      )
      .reduce((sum, e) => sum + e.lines.reduce((s, l) => s + Math.max(0, -l.amount), 0), 0)
  );
}

/**
 * Gasto total del periodo, TODAS las categorías. Es el numerador del indicador
 * de la quincena: cuenta también lo gastado en categorías sin concepto de
 * presupuesto, que la pestaña desglosa aparte como "fuera de presupuesto" (D-076).
 */
export function totalSpentInRange(entries: JournalEntryLike[], range: DateRange): number {
  return round2(
    entries
      .filter((e) => e.status !== "Reversed" && e.type === "expense" && e.date >= range.fromISO && e.date <= range.toISO)
      .reduce((sum, e) => sum + e.lines.reduce((s, l) => s + Math.max(0, -l.amount), 0), 0)
  );
}

/**
 * Ingreso realmente registrado en movimientos dentro del periodo. NO sustituye a
 * `profiles.quincenal_income` (la base declarada del plan): se muestra al lado
 * como contraste cuando ambos difieren.
 */
export function totalIncomeInRange(entries: JournalEntryLike[], range: DateRange): number {
  return round2(
    entries
      .filter((e) => e.status !== "Reversed" && e.type === "income" && e.date >= range.fromISO && e.date <= range.toISO)
      .reduce((sum, e) => sum + e.lines.reduce((s, l) => s + Math.max(0, l.amount), 0), 0)
  );
}

// ---------------------------------------------------------------------------
// Fila QUINCENAL
// ---------------------------------------------------------------------------

export type BudgetStatus = "ok" | "warn" | "over";

export interface BudgetQuincenaRow {
  id: string;
  category: string;
  /** Aportación planeada de esta quincena (q1Amount o q2Amount). */
  planned: number;
  /** Arrastre de la quincena anterior que el usuario decidió aplicar (0 si no lo aplicó). */
  carryIn: number;
  /** planned + carryIn. */
  available: number;
  /** Gasto del concepto dentro de esta quincena. */
  spent: number;
  /** available − spent. Positivo = te queda; negativo = te pasaste. */
  remaining: number;
  /** 0-100, topado para la barra de progreso. */
  pct: number;
  status: BudgetStatus;
}

/**
 * Estado de un concepto dentro de UNA quincena.
 *
 * `carryIn` lo decide el usuario, no el sistema (D-076): la quincena arranca
 * limpia salvo que él aplique explícitamente el sobrante o el exceso anterior.
 * El `remaining` de una quincena cerrada es justamente el arrastre que se le
 * ofrece a la siguiente — por eso no hace falta otra función para calcularlo.
 */
export function budgetQuincenaRow(
  line: BudgetLine,
  entries: JournalEntryLike[],
  q: Quincena,
  carryIn: number
): BudgetQuincenaRow {
  const planned = q.half === 1 ? line.q1Amount : line.q2Amount;
  const available = round2(planned + carryIn);
  const spent = spentInRange(entries, line.category, q);

  // Un concepto sin disponible pero con gasto está EXCEDIDO, no en cero: la
  // división daría Infinity/NaN, así que el caso se resuelve aparte.
  const ratio = available > 0 ? spent / available : spent > 0 || available < 0 ? Infinity : 0;

  return {
    id: line.id,
    category: line.category,
    planned,
    carryIn: round2(carryIn),
    available,
    spent,
    remaining: round2(available - spent),
    pct: Number.isFinite(ratio) ? Math.min(100, Math.round(ratio * 100)) : 100,
    status: ratio > 1 ? "over" : ratio >= 0.85 ? "warn" : "ok"
  };
}

/**
 * Cuánto se le OFRECE al usuario arrastrar de la quincena `previous` a la
 * siguiente: el cierre de esa quincena (+ sobrante / − exceso).
 *
 * `lineCreatedAtISO` no es un detalle de auditoría: un concepto creado DESPUÉS de
 * que esa quincena cerró no existía entonces, así que no dejó sobrante alguno.
 * Sin esta guarda, un concepto nuevo ofrecería arrastrar su aportación íntegra
 * de una quincena que nunca vivió, que es presupuesto inventado.
 */
export function carryoverOffered(
  line: BudgetLine,
  entries: JournalEntryLike[],
  previous: Quincena,
  previousCarryIn: number,
  lineCreatedAtISO: string
): number {
  if (lineCreatedAtISO.slice(0, 10) > previous.toISO) return 0;
  return budgetQuincenaRow(line, entries, previous, previousCarryIn).remaining;
}

// ---------------------------------------------------------------------------
// Fila MENSUAL (resumen del mes y "Presupuesto restante" del Home)
// ---------------------------------------------------------------------------

export interface BudgetTabRow {
  id: string;
  category: string;
  monthlyCost: number;
  q1Amount: number;
  q2Amount: number;
  /** Gasto real del concepto en el mes (Posted + Reconciled, excluye Reversed). */
  spent: number;
  /** Restante del mes = costo mensual − gasto. */
  balance: number;
}

/** Estado de un concepto dentro de un MES natural (usar monthRangeOf de quincena.ts). */
export function budgetTabRow(line: BudgetLine, entries: JournalEntryLike[], month: DateRange): BudgetTabRow {
  const spent = spentInRange(entries, line.category, month);
  return {
    id: line.id,
    category: line.category,
    monthlyCost: line.monthlyCost,
    q1Amount: line.q1Amount,
    q2Amount: line.q2Amount,
    spent,
    balance: round2(line.monthlyCost - spent)
  };
}
