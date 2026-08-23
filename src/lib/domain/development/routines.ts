// src/lib/domain/development/routines.ts
// Rutinas — lógica pura, sin React ni Supabase (probada en
// tests/domain/development-routines.test.ts).
//
// LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO
// No guarda horarios: el bloque sigue viviendo en `occupations`. No calcula
// rachas: siguen viviendo en `habit_logs`. Una rutina solo aporta el ORDEN de
// los pasos y el puente hacia el hábito que ya existe.

import { addDaysISO, diffDays } from "../datetime.ts";

export type Frequency = "Diario" | "Semanal" | "Entre semana" | "Fin de semana";

export interface StepLike {
  id: string;
  durationMin: number;
}

/**
 * Mismos cuatro valores que `habits.frequency`. "Semanal" se ancla al lunes:
 * una rutina semanal necesita un día concreto para poder medir adherencia, y
 * el lunes es el arranque de semana que ya usa /planning.
 */
export function routineDueToday(frequency: Frequency, dateISO: string): boolean {
  const dow = new Date(`${dateISO}T00:00:00Z`).getUTCDay(); // 0 = domingo
  switch (frequency) {
    case "Diario":
      return true;
    case "Semanal":
      return dow === 1;
    case "Entre semana":
      return dow >= 1 && dow <= 5;
    case "Fin de semana":
      return dow === 0 || dow === 6;
  }
}

export function routineProgress(
  completedStepIds: string[],
  steps: StepLike[]
): { done: number; total: number; pct: number; remainingMin: number } {
  const done = new Set(completedStepIds);
  const hechos = steps.filter((s) => done.has(s.id));
  return {
    done: hechos.length,
    total: steps.length,
    pct: steps.length === 0 ? 0 : Math.round((hechos.length / steps.length) * 100),
    remainingMin: steps.filter((s) => !done.has(s.id)).reduce((sum, s) => sum + s.durationMin, 0)
  };
}

function toMinutes(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** ¿Cabe la rutina en el bloque al que está anclada? Sin bloque, siempre cabe. */
export function routineFitsBlock(steps: StepLike[], block: { start: string; end: string } | null): boolean {
  if (block === null) return true;
  const total = steps.reduce((sum, s) => sum + s.durationMin, 0);
  return total <= toMinutes(block.end) - toMinutes(block.start);
}

/** % de días que tocaban en el rango y sí se ejecutaron. */
export function routineAdherence(
  completedRunDates: string[],
  frequency: Frequency,
  fromISO: string,
  toISO: string
): number {
  const done = new Set(completedRunDates);
  let due = 0;
  let hit = 0;
  for (let d = fromISO; diffDays(d, toISO) >= 0; d = addDaysISO(d, 1)) {
    if (!routineDueToday(frequency, d)) continue;
    due++;
    if (done.has(d)) hit++;
  }
  return due === 0 ? 0 : Math.round((hit / due) * 100);
}

export function nextCompletedSteps(current: string[], stepId: string): string[] {
  return current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId];
}

export type HabitLogEffect = "insert" | "noop";

/**
 * El puente que evita duplicar la racha. Dos reglas deliberadas:
 *  - Si el hábito ya se marcó hoy (desde /development/habits o desde otra
 *    rutina), no se inserta otra vez: `habit_logs` es único por
 *    (habit_id, log_date) y marcar dos veces no debe reventar.
 *  - Desmarcar el paso NO desmarca el hábito. El usuario pudo haberlo
 *    cumplido por otra vía, y borrar su racha desde aquí sería destruir un
 *    dato que esta rutina no es dueña de negar.
 */
export function habitLogEffect(habitId: string | null, willBeDone: boolean, alreadyLoggedToday: boolean): HabitLogEffect {
  if (habitId === null) return "noop";
  if (!willBeDone) return "noop";
  return alreadyLoggedToday ? "noop" : "insert";
}
