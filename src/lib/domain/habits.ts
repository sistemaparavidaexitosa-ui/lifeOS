// Hábitos — FR-HAB-001/002/006, BR-026.

import type { HabitLogLike } from "./types.ts";

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * FR-HAB-002: racha de días consecutivos terminando en `todayISO` (inclusive
 * si hoy ya se marcó cumplido).
 *
 * LEGADO. La pantalla de rutinas ya cuenta rachas por ranura con
 * `habitStreaks` (development/habit-analytics.ts, D-159), que no se corta por
 * no haber marcado hoy y cuenta semanas en los hábitos semanales. Esta queda
 * solo para `habitsFacts`, que la llama a propósito desde anteayer; se migra
 * cuando la fase de insights nocturnos rehaga esos hechos.
 */
export function habitStreak(habitId: string, logs: HabitLogLike[], todayISO: string): number {
  const dates = new Set(logs.filter((l) => l.habitId === habitId).map((l) => l.date));
  let streak = 0;
  let cursor = todayISO;
  while (dates.has(cursor)) {
    streak++;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}
