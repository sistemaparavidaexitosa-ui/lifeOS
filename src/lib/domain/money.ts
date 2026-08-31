// Ledger de doble partida — FR-MNY-002/003/005, BR-001/002/003.
// Dinero SIEMPRE como number (representando unidades con 2 decimales,
// redondeado con round2). Prohibido `float` sin control — ver guardrail
// "no usar floats para dinero"; en SQL las columnas son `numeric(20,6)`.

import type { JournalEntryLike, DebtLike } from "./types.ts";
import { round2 } from "./budget.ts";

/** BR-002: una transferencia mueve valor entre cuentas y NO es ingreso ni gasto. */
export function accountBalance(accountId: string, openingBalance: number, entries: JournalEntryLike[]): number {
  let balance = openingBalance;
  for (const e of entries) {
    if (e.status === "Reversed") continue;
    for (const l of e.lines) {
      if (l.account === accountId) balance += l.amount;
    }
  }
  return round2(balance);
}

export interface PeriodStats {
  income: number;
  expense: number;
  transfers: number;
  available: number;
}

/**
 * `toISO` es opcional para no cambiar el comportamiento de /reports, que trabaja
 * con un periodo abierto hacia adelante. Los llamadores que miran una QUINCENA
 * cerrada (D-076) sí lo pasan: sin tope, mirar una quincena pasada arrastraba
 * todo el gasto posterior y el número dejaba de significar nada.
 */
export function periodStats(entries: JournalEntryLike[], fromISO: string, toISO?: string): PeriodStats {
  let income = 0;
  let expense = 0;
  let transfers = 0;
  for (const e of entries) {
    if (e.status === "Reversed" || e.date < fromISO) continue;
    if (toISO && e.date > toISO) continue;
    if (e.type === "income") income += e.lines.reduce((s, l) => s + Math.max(0, l.amount), 0);
    else if (e.type === "expense") expense += e.lines.reduce((s, l) => s + Math.max(0, -l.amount), 0);
    else transfers += e.lines.reduce((s, l) => s + Math.max(0, l.amount), 0);
  }
  return { income: round2(income), expense: round2(expense), transfers: round2(transfers), available: round2(income - expense) };
}

/** BR-003: patrimonio neto = activos valuados − pasivos, a una fecha de corte. */
export function netWorth(totalAssets: number, totalLiabilities: number): number {
  return round2(totalAssets - totalLiabilities);
}

/**
 * FR-DEB-006, BR-024: un pago de deuda vinculado reduce SOLO el saldo de la
 * deuda referenciada; nunca afecta otras deudas.
 */
export function applyDebtPayment(debt: DebtLike, amount: number): DebtLike {
  return { ...debt, balance: round2(Math.max(0, debt.balance - amount)) };
}

/** FR-DEB-007, BR-025: cashback acumulado = estimado − redenciones (informativo). */
export function cashbackAccrued(accruedEstimate: number, redemptions: number[]): number {
  const redeemed = redemptions.reduce((s, r) => s + r, 0);
  return round2(accruedEstimate - redeemed);
}

/** FR-INV-002: rentabilidad simple = (valuación - capital) / capital. */
export function investmentReturnPct(principal: number, valuation: number): number {
  if (!principal) return 0;
  return round2(((valuation - principal) / principal) * 100);
}

export interface SavingsProjection {
  remaining: number;
  months: number; // Infinity si monthly <= 0
  pct: number;
}

/** FR-SAV-002: proyección de una meta de ahorro (escenario sujeto a supuestos, BR-010). */
export function savingsProjection(target: number, current: number, monthly: number): SavingsProjection {
  const remaining = Math.max(0, target - current);
  const months = monthly > 0 ? Math.ceil(remaining / monthly) : Infinity;
  const pct = target ? Math.round((current / target) * 100) : 0;
  return { remaining: round2(remaining), months, pct };
}
