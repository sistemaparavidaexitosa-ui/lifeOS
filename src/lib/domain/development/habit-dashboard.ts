// src/lib/domain/development/habit-dashboard.ts
// Series y KPIs de la pestaña Analítica de Rutinas — lógica pura (probada en
// tests/domain/habit-dashboard.test.ts).
//
// Este módulo no inventa reglas: compone las de habit-analytics.ts (ranuras,
// estados, rachas, cumplimiento; D-159) en lo que dibuja cada tarjeta y cada
// gráfica. Si una cifra de Analítica y otra de Hoy discrepan, el fallo está
// aquí, porque debajo hay una sola definición.

import { addDaysISO, diffDays, weekStartISO } from "../datetime.ts";
import {
  completionRate,
  habitStreaks,
  slotStates,
  type HabitSeries,
  type SlotResult
} from "./habit-analytics.ts";

export type Rango = 7 | 30 | 90 | 365;

const RANGOS: Rango[] = [7, 30, 90, 365];

/** El rango de la URL (`?rango=`). Cualquier valor desconocido cae a 30 días. */
export function parseRango(v: string | undefined): Rango {
  const n = Number(v);
  return (RANGOS as number[]).includes(n) ? (n as Rango) : 30;
}

/** Un día de la curva. `pct` es null cuando ese día no había nada que juzgar. */
export interface DayPoint {
  date: string;
  pct: number | null;
  judged: number;
  done: number;
}

const JUZGADO = (r: SlotResult) => r.state === "completed" || r.state === "skipped" || r.state === "missing";

/**
 * ¿A qué día de la curva pertenece una ranura?
 *
 * Una ranura diaria, a su día. Una semanal, a su domingo: es cuando la semana
 * termina y se sabe si se cumplió. La excepción es la semana en curso ya
 * cumplida, que se apunta hoy — esperar al domingo para enseñar algo que ya
 * hiciste haría que la curva pareciera no escucharte.
 */
function diaDeLaRanura(r: SlotResult, todayISO: string): string | null {
  if (r.slot.start === r.slot.end) return r.state === "pending" ? null : r.slot.start;
  if (diffDays(r.slot.end, todayISO) >= 0) return r.slot.end;
  return r.state === "completed" ? todayISO : null;
}

/** Cumplimiento de cada día de [from, to] (sin pasar de hoy). */
export function dailyCurve(series: HabitSeries[], fromISO: string, toISO: string, todayISO: string): DayPoint[] {
  const hasta = diffDays(toISO, todayISO) >= 0 ? toISO : todayISO;
  const acumulado = new Map<string, { sum: number; judged: number; done: number }>();

  for (const s of series) {
    // Seis días antes de `from` para alcanzar la semana cuyo domingo cae dentro.
    for (const r of slotStates(s, addDaysISO(fromISO, -6), hasta, todayISO)) {
      if (!JUZGADO(r)) continue;
      const dia = diaDeLaRanura(r, todayISO);
      if (dia === null || diffDays(fromISO, dia) < 0 || diffDays(dia, hasta) < 0) continue;
      const a = acumulado.get(dia) ?? { sum: 0, judged: 0, done: 0 };
      a.sum += r.pct;
      a.judged++;
      if (r.state === "completed") a.done++;
      acumulado.set(dia, a);
    }
  }

  const puntos: DayPoint[] = [];
  for (let d = fromISO; diffDays(d, hasta) >= 0; d = addDaysISO(d, 1)) {
    const a = acumulado.get(d);
    puntos.push(
      a ? { date: d, pct: Math.round(a.sum / a.judged), judged: a.judged, done: a.done } : { date: d, pct: null, judged: 0, done: 0 }
    );
  }
  return puntos;
}

/** Umbral de un día sólido: la mayor parte de lo que tocaba, no la perfección. */
export const SOLIDO = 80;

/**
 * Días sólidos seguidos, hacia atrás desde hoy.
 *
 * Hoy por debajo del umbral no corta —el día sigue abierto— y un día sin nada
 * que juzgar se salta: un domingo sin rutinas no es un día flojo.
 */
export function solidDaysStreak(curve: DayPoint[], todayISO: string): number {
  let racha = 0;
  for (let i = curve.length - 1; i >= 0; i--) {
    const p = curve[i]!;
    if (p.pct === null) continue;
    if (p.pct >= SOLIDO) {
      racha++;
      continue;
    }
    if (p.date === todayISO) continue;
    break;
  }
  return racha;
}

/** % de días sólidos entre los días juzgados de los últimos 30 puntos. */
export function disciplineIndex(curve: DayPoint[], todayISO: string): number | null {
  const juzgados = curve
    .slice(-30)
    .filter((p) => p.pct !== null && !(p.date === todayISO && p.pct < SOLIDO));
  if (!juzgados.length) return null;
  return Math.round((juzgados.filter((p) => p.pct! >= SOLIDO).length / juzgados.length) * 100);
}

/**
 * Tasa de éxito: ranuras completadas entre ranuras juzgadas, SIN mirar el
 * porcentaje. Responde «¿cuántas veces apareciste?», que es otra pregunta que
 * «¿cuánto hiciste?» (esa es `completionRate`).
 */
export function successRate(series: HabitSeries[], fromISO: string, toISO: string, todayISO: string): number | null {
  let juzgadas = 0;
  let hechas = 0;
  for (const s of series) {
    for (const r of slotStates(s, fromISO, toISO, todayISO)) {
      if (!JUZGADO(r)) continue;
      juzgadas++;
      if (r.state === "completed") hechas++;
    }
  }
  return juzgadas === 0 ? null : Math.round((hechas / juzgadas) * 100);
}

export interface WeekPoint {
  weekStart: string;
  pct: number | null;
}

/** Cumplimiento por semana ISO, desde la semana de `from` hasta la de hoy. */
export function weeklyTrend(series: HabitSeries[], fromISO: string, todayISO: string): WeekPoint[] {
  const semanas: WeekPoint[] = [];
  for (let lunes = weekStartISO(fromISO); diffDays(lunes, todayISO) >= 0; lunes = addDaysISO(lunes, 7)) {
    const domingo = addDaysISO(lunes, 6);
    semanas.push({ weekStart: lunes, pct: completionRate(series, lunes, diffDays(domingo, todayISO) >= 0 ? domingo : todayISO, todayISO) });
  }
  return semanas;
}

export interface PeriodRates {
  day: number | null;
  week: number | null;
  month: number | null;
  quarter: number | null;
  year: number | null;
}

/** Cumplimiento de hoy y de la semana, mes, trimestre y año naturales en curso. */
export function periodRates(series: HabitSeries[], todayISO: string): PeriodRates {
  const [y, m] = todayISO.split("-").map(Number) as [number, number];
  const mes = `${y}-${String(m).padStart(2, "0")}-01`;
  const trimestre = `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  return {
    day: completionRate(series, todayISO, todayISO, todayISO),
    week: completionRate(series, weekStartISO(todayISO), todayISO, todayISO),
    month: completionRate(series, mes, todayISO, todayISO),
    quarter: completionRate(series, trimestre, todayISO, todayISO),
    year: completionRate(series, `${y}-01-01`, todayISO, todayISO)
  };
}

function resta(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

/** Cumplimiento a 7 días menos cumplimiento a 30: hacia dónde vas ahora mismo. */
export function momentum(series: HabitSeries[], todayISO: string): number | null {
  return resta(
    completionRate(series, addDaysISO(todayISO, -6), todayISO, todayISO),
    completionRate(series, addDaysISO(todayISO, -29), todayISO, todayISO)
  );
}

/** Los últimos 30 días frente a los 30 anteriores. */
export function monthlyTrend(
  series: HabitSeries[],
  todayISO: string
): { current: number | null; previous: number | null; delta: number | null } {
  const current = completionRate(series, addDaysISO(todayISO, -29), todayISO, todayISO);
  const previous = completionRate(series, addDaysISO(todayISO, -59), addDaysISO(todayISO, -30), todayISO);
  return { current, previous, delta: resta(current, previous) };
}

export interface HabitRow {
  habitId: string;
  rate30: number | null;
  rate90: number | null;
  rateRange: number | null;
  consistency: number | null;
  current: number;
  longest: number;
  unit: "día" | "semana";
  /** Omitidas + sin registro dentro del rango. */
  misses: number;
}

/**
 * Cumplimiento de 30 días en el que las ranuras de la última semana pesan el
 * doble. Lo usan la consistencia de cada hábito y el componente «Constancia»
 * del Identity Score (D-160).
 */
export function recencyWeightedRate(series: HabitSeries[], todayISO: string): number | null {
  const reciente = addDaysISO(todayISO, -6);
  let suma = 0;
  let peso = 0;
  for (const s of series) {
    for (const r of slotStates(s, addDaysISO(todayISO, -29), todayISO, todayISO)) {
      if (!JUZGADO(r)) continue;
      const w = diffDays(reciente, r.slot.end) >= 0 ? 2 : 1;
      suma += r.pct * w;
      peso += w;
    }
  }
  return peso === 0 ? null : suma / peso;
}

/**
 * Una fila por hábito para la tabla de Analítica.
 *
 * Consistencia = 0,7 × cumplimiento de 30 días ponderado por recencia + 0,3 ×
 * cumplimiento de 90. Mezcla lo que estás haciendo ahora con lo que llevas
 * haciendo: un buen arranque no borra tres meses flojos, ni al revés.
 */
export function habitRows(series: HabitSeries[], rangeFromISO: string, todayISO: string): HabitRow[] {
  return series.map((s) => {
    const rate90 = completionRate([s], addDaysISO(todayISO, -89), todayISO, todayISO);
    const ponderada = recencyWeightedRate([s], todayISO);
    const rachas = habitStreaks(s, todayISO, addDaysISO(todayISO, -364));
    return {
      habitId: s.habitId,
      rate30: completionRate([s], addDaysISO(todayISO, -29), todayISO, todayISO),
      rate90,
      rateRange: completionRate([s], rangeFromISO, todayISO, todayISO),
      consistency: ponderada === null ? null : Math.round(0.7 * ponderada + 0.3 * (rate90 ?? ponderada)),
      current: rachas.current,
      longest: rachas.longest,
      unit: rachas.unit,
      misses: slotStates(s, rangeFromISO, todayISO, todayISO).filter((r) => r.state === "skipped" || r.state === "missing").length
    };
  });
}

export interface StreakSegment {
  habitId: string;
  start: string;
  end: string;
  /** Ranuras completadas dentro del tramo. */
  length: number;
}

/** Los tramos de racha de cada hábito dentro del rango, para la línea de tiempo. */
export function streakSegments(series: HabitSeries[], fromISO: string, todayISO: string): StreakSegment[] {
  const tramos: StreakSegment[] = [];
  for (const s of series) {
    let abierto: StreakSegment | null = null;
    for (const r of slotStates(s, fromISO, todayISO, todayISO)) {
      if (r.state === "completed") {
        const fin = diffDays(r.slot.end, todayISO) >= 0 ? r.slot.end : todayISO;
        if (abierto) {
          abierto.end = fin;
          abierto.length++;
        } else {
          abierto = { habitId: s.habitId, start: r.slot.start, end: fin, length: 1 };
        }
      } else if (r.state === "skipped" || r.state === "missing") {
        if (abierto) tramos.push(abierto);
        abierto = null;
      }
    }
    if (abierto) tramos.push(abierto);
  }
  return tramos;
}

/**
 * Área de vida de una categoría de hábito. Las áreas son las de
 * `personal_goals.area`, para que el radar hable el mismo idioma que las metas.
 */
export function areaOfCategory(category: string): string {
  switch (category) {
    case "Salud":
      return "Salud";
    case "Aprendizaje":
      return "Aprendizaje";
    case "Trabajo":
      return "Carrera";
    default:
      return "Personal";
  }
}

/** Cumplimiento de 30 días por área de vida, ordenado por nombre de área. */
export function areaRates(
  series: HabitSeries[],
  areaOf: (habitId: string) => string,
  todayISO: string
): { area: string; pct: number | null }[] {
  const grupos = new Map<string, HabitSeries[]>();
  for (const s of series) {
    const area = areaOf(s.habitId);
    grupos.set(area, [...(grupos.get(area) ?? []), s]);
  }
  return [...grupos.entries()]
    .map(([area, ss]) => ({ area, pct: completionRate(ss, addDaysISO(todayISO, -29), todayISO, todayISO) }))
    .sort((a, b) => a.area.localeCompare(b.area, "es"));
}

/** Las semanas (lunes a domingo) de un mes `yyyy-mm`, con null fuera del mes. */
export function monthGrid(yearMonth: string): (string | null)[][] {
  const primero = `${yearMonth}-01`;
  const semanas: (string | null)[][] = [];
  for (let lunes = weekStartISO(primero); lunes.slice(0, 7) <= yearMonth; lunes = addDaysISO(lunes, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => {
      const d = addDaysISO(lunes, i);
      return d.slice(0, 7) === yearMonth ? d : null;
    }));
  }
  return semanas;
}
