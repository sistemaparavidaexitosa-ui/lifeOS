// src/lib/domain/development/habit-analytics.ts
// Analítica de hábitos — lógica pura, sin React ni Supabase (probada en
// tests/domain/habit-analytics.test.ts).
//
// POR QUÉ EXISTE
// Hasta 0063 un registro solo decía «hecho», y la racha se contaba en días
// seguidos terminando HOY (`habitStreak` en domain/habits.ts). Eso tenía dos
// fallos que se veían en pantalla:
//   - a las nueve de la mañana, antes de marcar nada, todas las rachas valían 0;
//   - un hábito de una rutina semanal nunca pasaba de 1, porque la racha medía
//     días y el hábito tocaba cada siete.
//
// Aquí la unidad no es el día sino la RANURA: el hueco en el que al hábito le
// toca pasar. Un día en las rutinas diarias, entre semana y de fin de semana;
// una semana ISO entera en las semanales, porque «una vez por semana» se cumple
// el miércoles igual que el lunes. Cada ranura acaba en un estado, y las rachas
// y los porcentajes se leen de esos estados. Nada de esto se guarda en la base:
// se calcula desde `habit_log_series` (D-162).
//
// Las reglas de estado y de racha están en D-159.

import { addDaysISO, diffDays, weekStartISO } from "../datetime.ts";
import { routineDueToday, type Frequency } from "./routines.ts";

export type LogStatus = "completed" | "skipped" | "postponed";

export interface HabitLogEntry {
  date: string;
  status: LogStatus;
  /** 1..100 si está completado; 0 en otro estado (lo garantiza un check de 0063). */
  pct: number;
  mood?: number | null;
  energy?: number | null;
  /** Solo viaja cuando la pantalla lo pide: la RPC de series no la trae. */
  note?: string;
}

export interface HabitSeries {
  habitId: string;
  /** La frecuencia de la rutina de la que cuelga. La actual: la historia no está versionada. */
  frequency: Frequency;
  /** Fecha local en que se creó el hábito. Antes no había nada que cumplir. */
  createdOn: string;
  logs: HabitLogEntry[];
}

/** El hueco en el que al hábito le toca pasar: un día, o una semana ISO. */
export interface Slot {
  key: string;
  start: string;
  end: string;
}

/**
 * `pending`: la ranura contiene hoy y aún no tiene registro — no se juzga.
 * `missing`: la ranura ya pasó sin registro — cuenta como no hecho.
 */
export type SlotState = LogStatus | "pending" | "missing";

export interface SlotResult {
  slot: Slot;
  state: SlotState;
  pct: number;
  entry: HabitLogEntry | null;
}

/**
 * Las ranuras de una frecuencia que tocan el rango [from, to].
 *
 * Una semana se devuelve ENTERA aunque el rango la corte: la ranura es la
 * semana, y medio lunes-domingo no es una ranura más pequeña, es la misma.
 */
export function slotsFor(frequency: Frequency, fromISO: string, toISO: string): Slot[] {
  if (diffDays(fromISO, toISO) < 0) return [];

  if (frequency === "Semanal") {
    const slots: Slot[] = [];
    for (let lunes = weekStartISO(fromISO); diffDays(lunes, toISO) >= 0; lunes = addDaysISO(lunes, 7)) {
      slots.push({ key: lunes, start: lunes, end: addDaysISO(lunes, 6) });
    }
    return slots;
  }

  const slots: Slot[] = [];
  for (let d = fromISO; diffDays(d, toISO) >= 0; d = addDaysISO(d, 1)) {
    if (routineDueToday(frequency, d)) slots.push({ key: d, start: d, end: d });
  }
  return slots;
}

/**
 * Cuánto vale cada estado cuando hay varios registros en la misma ranura (solo
 * pasa en las semanales). Gana lo que más dice a favor: si el lunes lo omitiste
 * y el jueves lo hiciste, esa semana se cumplió.
 */
const PRIORIDAD: Record<LogStatus, number> = { completed: 3, postponed: 2, skipped: 1 };

/**
 * El estado de cada ranura en [from, to], en orden cronológico.
 *
 * Se excluyen las ranuras que empiezan después de hoy —el futuro no se juzga— y
 * las que terminaron antes de que el hábito existiera: sin eso, un hábito
 * creado ayer arrastraría un año de huecos.
 */
export function slotStates(series: HabitSeries, fromISO: string, toISO: string, todayISO: string): SlotResult[] {
  const porFecha = new Map(series.logs.map((l) => [l.date, l]));

  return slotsFor(series.frequency, fromISO, toISO)
    .filter((slot) => diffDays(slot.start, todayISO) >= 0 && diffDays(series.createdOn, slot.end) >= 0)
    .map((slot) => {
      let mejor: HabitLogEntry | null = null;
      for (let d = slot.start; diffDays(d, slot.end) >= 0; d = addDaysISO(d, 1)) {
        const entry = porFecha.get(d);
        if (!entry) continue;
        if (
          mejor === null ||
          PRIORIDAD[entry.status] > PRIORIDAD[mejor.status] ||
          (entry.status === mejor.status && entry.pct > mejor.pct)
        ) {
          mejor = entry;
        }
      }

      if (mejor) return { slot, state: mejor.status, pct: mejor.pct, entry: mejor };
      const contieneHoy = diffDays(slot.start, todayISO) >= 0 && diffDays(todayISO, slot.end) >= 0;
      return { slot, state: contieneHoy ? "pending" : "missing", pct: 0, entry: null };
    });
}

/**
 * Racha actual y máxima, en la unidad de la frecuencia.
 *
 * Reglas (D-159):
 *   - completado suma 1, aunque sea parcial: un voto a medias sigue siendo voto;
 *   - pospuesto y pendiente se saltan: ni suman ni cortan;
 *   - omitido y sin registro cortan.
 *
 * `windowFromISO` acota cuánto atrás se mira. La racha máxima es «la más larga
 * dentro de la ventana», no la de toda la vida.
 */
export function habitStreaks(
  series: HabitSeries,
  todayISO: string,
  windowFromISO: string
): { current: number; longest: number; unit: "día" | "semana" } {
  const estados = slotStates(series, windowFromISO, todayISO, todayISO);

  let longest = 0;
  let corrida = 0;
  for (const { state } of estados) {
    if (state === "completed") {
      corrida++;
      longest = Math.max(longest, corrida);
    } else if (state === "skipped" || state === "missing") {
      corrida = 0;
    }
  }

  // La corrida con la que termina el recorrido cronológico ES la racha actual:
  // lo único que la cortaría después sería un omitido o un hueco, y ya se contó.
  return { current: corrida, longest, unit: series.frequency === "Semanal" ? "semana" : "día" };
}

/**
 * % de cumplimiento de uno o varios hábitos en [from, to], 0..100.
 *
 * Σ porcentaje / (100 × ranuras que se juzgan). Se juzgan completadas,
 * omitidas y sin registro; los pospuestos y la ranura pendiente de hoy salen
 * del denominador. Varios hábitos se combinan ranura a ranura, así que el que
 * toca más veces pesa más — es el que más veces te pidió algo.
 *
 * `null` si no hay nada que juzgar: 0 % diría «no hiciste nada», y no es lo
 * mismo que «aún no te tocaba nada».
 */
export function completionRate(
  series: HabitSeries[],
  fromISO: string,
  toISO: string,
  todayISO: string
): number | null {
  let suma = 0;
  let juzgadas = 0;
  for (const s of series) {
    for (const r of slotStates(s, fromISO, toISO, todayISO)) {
      if (r.state === "postponed" || r.state === "pending") continue;
      juzgadas++;
      suma += r.pct;
    }
  }
  return juzgadas === 0 ? null : Math.round(suma / juzgadas);
}

/**
 * Qué hacer con `habit_logs` al tocar la casilla de un hábito hoy.
 *
 * Desmarcar un completado sigue siendo borrar, como desde 0046: es corregir un
 * toque, no registrar un «no lo hice». Pero tocar un omitido o un pospuesto
 * no lo borra, lo convierte en hecho — la persona está diciendo que al final sí.
 */
export function toggleEffect(existing: LogStatus | null): "insert" | "delete" | "complete" {
  if (existing === null) return "insert";
  return existing === "completed" ? "delete" : "complete";
}

/**
 * El registro de hoy que deja un toque en la casilla: lo mismo que devuelve
 * `toggleHabitToday`, calculado sin preguntar al servidor. La casilla lo pinta
 * en el acto y el servidor lo confirma después; si no coincidieran, manda el
 * servidor.
 */
export function toggledEntry(entry: HabitLogEntry | null, today: string): HabitLogEntry | null {
  if (toggleEffect(entry ? entry.status : null) === "delete") return null;
  return { date: today, status: "completed", pct: 100, note: entry?.note, mood: entry?.mood, energy: entry?.energy };
}

/** Una fila de `habit_log_series`: el histórico de un hábito en arreglos paralelos. */
export interface HabitLogSeriesRow {
  habit_id: string;
  dates: string[];
  statuses: string[];
  pcts: number[];
  moods: (number | null)[];
  energies: (number | null)[];
}

export interface HabitLike {
  id: string;
  frequency: Frequency;
  createdOn: string;
}

/**
 * Junta los hábitos con las filas de la RPC. Un hábito sin registros en el
 * rango no trae fila, y aun así tiene serie: vacía, que no es lo mismo que no
 * existir — sus ranuras cuentan como huecos.
 */
export function buildHabitSeries(habits: HabitLike[], rows: HabitLogSeriesRow[]): HabitSeries[] {
  const porHabito = new Map(rows.map((r) => [r.habit_id, r]));
  return habits.map((h) => {
    const r = porHabito.get(h.id);
    const logs: HabitLogEntry[] = r
      ? r.dates.map((date, i) => ({
          date,
          status: r.statuses[i] as LogStatus,
          pct: r.pcts[i] ?? 0,
          mood: r.moods[i] ?? null,
          energy: r.energies[i] ?? null
        }))
      : [];
    return { habitId: h.id, frequency: h.frequency, createdOn: h.createdOn, logs };
  });
}
