// src/lib/domain/development/goals.ts
// Metas personales — lógica pura, sin React ni Supabase (probada en
// tests/domain/development-goals.test.ts).
//
// La regla del módulo: el progreso NO se teclea. Cada resultado clave declara
// de dónde sale su número y esta capa lo calcula. Un progreso capturado a mano
// se desactualiza y convierte el módulo en una libreta.

import { diffDays } from "../datetime.ts";

export type KeyResultSourceKind =
  | "habit"
  | "project"
  | "book"
  | "financial_goal"
  | "savings_goal"
  | "nutrition"
  | "manual";

/** Qué mide un resultado clave de nutrición. Las demás fuentes lo ignoran. */
export type KeyResultMetric = "adherencia" | "peso";

export interface KeyResultLike {
  id: string;
  sourceKind: KeyResultSourceKind;
  sourceId: string | null;
  target: number;
  manualCurrent: number;
  /** Solo lo mira `nutrition`; para el resto es ruido con default. */
  sourceMetric?: KeyResultMetric;
  /**
   * El valor de partida, y **solo tiene sentido en una meta DESCENDENTE**
   * («bajar a 78 kg»). Sin él no hay forma de saber cuánto se ha avanzado: 81
   * kg puede ser casi la meta o no haber empezado, según de dónde se venga.
   */
  baseline?: number | null;
}

/** Valor actual de cada fuente posible, ya leído de la base por la capa de datos. */
export interface SourceSnapshot {
  habitCompletionPct: Record<string, number>;
  projectDonePct: Record<string, number>;
  bookPagesRead: Record<string, number>;
  financialGoalAmount: Record<string, number>;
  /** Migración 0035: `savings_goals` es hermana de `financial_goals`, no un caso aparte. */
  savingsGoalAmount: Record<string, number>;
  /** Migración 0047. La clave es el `user_id`: hay una fila de perfil por persona. */
  nutritionAdherencePct: Record<string, number>;
  /** Migración 0047. El peso más reciente, por `user_id`. */
  bodyWeightKg: Record<string, number>;
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

/**
 * De qué tabla del snapshot sale el número de cada fuente. `manual` no aparece:
 * se atiende antes, porque su valor no viene del snapshot sino del propio
 * resultado clave.
 */
const SOURCE_TABLE: Record<
  Exclude<KeyResultSourceKind, "manual">,
  (s: SourceSnapshot, kr: KeyResultLike) => Record<string, number>
> = {
  habit: (s) => s.habitCompletionPct,
  project: (s) => s.projectDonePct,
  book: (s) => s.bookPagesRead,
  financial_goal: (s) => s.financialGoalAmount,
  savings_goal: (s) => s.savingsGoalAmount,
  // La única fuente que mide dos cosas distintas, y por eso recibe el propio
  // resultado clave. Una fuente por métrica habría sido `nutrition_adherencia`
  // y `nutrition_peso` en el check de la base: dos valores para un módulo.
  nutrition: (s, kr) => (kr.sourceMetric === "peso" ? s.bodyWeightKg : s.nutritionAdherencePct)
};

/**
 * El porcentaje de una meta que se cumple BAJANDO.
 *
 * `pctOf` no sirve aquí: 81 kg contra un objetivo de 78 da 103 %, que recortado
 * a 100 haría nacer cumplida cualquier meta de bajar peso. Lo que se avanza es
 * el trecho recorrido desde el punto de partida, y por eso hace falta
 * `baseline`.
 */
function pctDescendente(current: number, baseline: number, target: number): number {
  const trecho = baseline - target;
  if (trecho <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((baseline - current) / trecho) * 100)));
}

export function keyResultProgress(kr: KeyResultLike, sources: SourceSnapshot): KeyResultProgress {
  if (kr.sourceKind === "manual") {
    return { current: kr.manualCurrent, target: kr.target, pct: pctOf(kr.manualCurrent, kr.target), stale: false };
  }

  // Un `switch` exhaustivo y no una cadena de ternarios con un `else` al final:
  // con el else, añadir una fuente nueva y olvidar su rama la mandaba
  // silenciosamente a la tabla de la última: el resultado clave mostraba el
  // número de OTRA cosa. Así, olvidarla no compila.
  const table = SOURCE_TABLE[kr.sourceKind](sources, kr);

  const current = kr.sourceId === null ? undefined : table[kr.sourceId];
  if (current === undefined) return { current: 0, target: kr.target, pct: 0, stale: true };

  // Descendente = el objetivo está por debajo del punto de partida. Sin
  // `baseline` no se puede saber cuánto se ha avanzado, y fingir un número
  // sería peor que decir que la fuente no da: se declara `stale`, que es la
  // rama que la UI ya sabe pintar.
  if (kr.sourceMetric === "peso") {
    if (kr.baseline === null || kr.baseline === undefined) {
      return { current, target: kr.target, pct: 0, stale: true };
    }
    return { current, target: kr.target, pct: pctDescendente(current, kr.baseline, kr.target), stale: false };
  }

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
