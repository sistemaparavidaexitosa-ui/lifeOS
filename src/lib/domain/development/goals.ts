// src/lib/domain/development/goals.ts
// Metas personales — lógica pura, sin React ni Supabase (probada en
// tests/domain/development-goals.test.ts).
//
// La regla del módulo: el progreso NO se teclea. Cada resultado clave declara
// de dónde sale su número y esta capa lo calcula. Un progreso capturado a mano
// se desactualiza y convierte el módulo en una libreta.

import { diffDays } from "../datetime.ts";

export type KeyResultSourceKind = "habit" | "project" | "book" | "financial_goal" | "manual";

export interface KeyResultLike {
  id: string;
  sourceKind: KeyResultSourceKind;
  sourceId: string | null;
  target: number;
  manualCurrent: number;
}

/** Valor actual de cada fuente posible, ya leído de la base por la capa de datos. */
export interface SourceSnapshot {
  habitCompletionPct: Record<string, number>;
  projectDonePct: Record<string, number>;
  bookPagesRead: Record<string, number>;
  financialGoalAmount: Record<string, number>;
}

export interface KeyResultProgress {
  current: number;
  target: number;
  pct: number;
  /** La fuente ya no existe. La UI lo dice; no se finge un 0% real. */
  stale: boolean;
}

function pctOf(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

export function keyResultProgress(kr: KeyResultLike, sources: SourceSnapshot): KeyResultProgress {
  if (kr.sourceKind === "manual") {
    return { current: kr.manualCurrent, target: kr.target, pct: pctOf(kr.manualCurrent, kr.target), stale: false };
  }

  const table =
    kr.sourceKind === "habit" ? sources.habitCompletionPct
    : kr.sourceKind === "project" ? sources.projectDonePct
    : kr.sourceKind === "book" ? sources.bookPagesRead
    : sources.financialGoalAmount;

  const current = kr.sourceId === null ? undefined : table[kr.sourceId];
  if (current === undefined) return { current: 0, target: kr.target, pct: 0, stale: true };
  return { current, target: kr.target, pct: pctOf(current, kr.target), stale: false };
}

/** Promedio simple. Un resultado `stale` cuenta como 0 y la UI lo señala aparte. */
export function goalProgress(krs: KeyResultProgress[]): number {
  if (krs.length === 0) return 0;
  return Math.round(krs.reduce((sum, k) => sum + k.pct, 0) / krs.length);
}

/**
 * En riesgo = el calendario va más adelantado que el avance, por más de
 * `thresholdPoints` puntos porcentuales. Es una resta, no un modelo.
 */
export function goalAtRisk(
  startISO: string,
  horizonISO: string,
  pct: number,
  todayISO: string,
  thresholdPoints = 20
): boolean {
  const total = diffDays(startISO, horizonISO);
  if (total <= 0) return pct < 100; // horizonte vencido o inválido
  const elapsed = diffDays(startISO, todayISO);
  if (elapsed <= 0) return false;
  const expectedPct = Math.min(100, (elapsed / total) * 100);
  return expectedPct - pct > thresholdPoints;
}
