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

export function habitDoneToday(habitId: string, logs: HabitLogLike[], todayISO: string): boolean {
  return logs.some((l) => l.habitId === habitId && l.date === todayISO);
}
