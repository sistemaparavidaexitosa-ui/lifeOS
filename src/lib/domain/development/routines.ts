// src/lib/domain/development/routines.ts
// Rutinas — lógica pura, sin React ni Supabase (probada en
// tests/domain/development-routines.test.ts).
//
// LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO
// No guarda horarios: el bloque sigue viviendo en `occupations`, y ahora lo
// referencia la rutina, no cada hábito. No calcula rachas: siguen viviendo en
// `habit_logs`, que desde la migración 0046 es TAMBIÉN la única fuente de
// "¿hice hoy este paso?" — por eso `routine_runs` ya no lleva la lista de
// pasos completados. La rutina aporta el ORDEN y la FRECUENCIA; el hábito
// aporta el registro.

import { addDaysISO, diffDays } from "../datetime.ts";

export type Frequency = "Diario" | "Semanal" | "Entre semana" | "Fin de semana";

/**
 * Un hábito visto desde la rutina. Desde 0046 no hay una tabla de pasos: el
 * paso ES la fila del hábito, con su `position` y su `duration_min`.
 */
export interface RoutineHabitLike {
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

/**
 * `doneHabitIds` son los hábitos con registro en `habit_logs` para el día que
 * se está mirando. No hay un segundo lugar donde consultarlo.
 */
export function routineProgress(
  doneHabitIds: string[],
  habits: RoutineHabitLike[]
): { done: number; total: number; pct: number; remainingMin: number } {
  const done = new Set(doneHabitIds);
  const hechos = habits.filter((h) => done.has(h.id));
  return {
    done: hechos.length,
    total: habits.length,
    pct: habits.length === 0 ? 0 : Math.round((hechos.length / habits.length) * 100),
    remainingMin: habits.filter((h) => !done.has(h.id)).reduce((sum, h) => sum + h.durationMin, 0)
  };
}

function toMinutes(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** ¿Cabe la rutina en el bloque al que está anclada? Sin bloque, siempre cabe. */
export function routineFitsBlock(habits: RoutineHabitLike[], block: { start: string; end: string } | null): boolean {
  if (block === null) return true;
  const total = habits.reduce((sum, h) => sum + h.durationMin, 0);
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

/**
 * La ejecución del día se cierra cuando TODOS los hábitos de la rutina tienen
 * registro hoy.
 *
 * Una rutina sin hábitos devuelve `false` y no `true`: "todos los cero" es
 * cierto en lógica y falso en la vida. Darla por hecha regalaría días a la
 * adherencia de una rutina que nadie ha ejecutado.
 */
export function routineRunComplete(habitIds: string[], doneHabitIds: string[]): boolean {
  if (habitIds.length === 0) return false;
  const done = new Set(doneHabitIds);
  return habitIds.every((id) => done.has(id));
}

/**
 * ¿Hay que escribir en `routine_runs` después de tocar la rutina de hoy?
 *
 * `run` es la ejecución de hoy tal como está en la base (`closed` = tiene
 * `completed_at`), o `null` si no hay. `arranca` distingue ejecutar —tocar una
 * casilla— de editar —añadir o borrar un hábito—.
 *
 * Si la fila YA existe, se corrige cuando miente: añadir un hábito a una rutina
 * cerrada hoy la deja incompleta, y borrar el único que faltaba la completa sin
 * que nadie toque una casilla. Si ya dice la verdad no se toca: marcar el
 * primero de cinco hábitos no cambia nada, y escribir igual costaba un viaje a
 * la base en cada toque y reescribía la hora de cierre.
 *
 * Si NO existe, editar no es ejecutar: crear la fila inventaría un `started_at`
 * de una rutina que nadie arrancó, y el motor de análisis, que mide «no se
 * ejecuta desde hace N días» contando esas filas, se callaría el aviso porque
 * alguien cambió un nombre. Solo se crea al ejecutar o si la rutina queda
 * cerrada.
 */
export function routineRunWrite(run: { closed: boolean } | null, complete: boolean, arranca: boolean): boolean {
  if (run) return run.closed !== complete;
  return arranca || complete;
}
