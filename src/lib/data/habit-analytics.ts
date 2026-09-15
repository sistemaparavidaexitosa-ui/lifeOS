// src/lib/data/habit-analytics.ts
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUserTimeZone, todayForUser } from "@/lib/data/profile";
import { addDaysISO, diffDays, todayInTimeZone } from "@/lib/domain/datetime.ts";
import type { Frequency } from "@/lib/domain/development/routines.ts";
import { buildHabitSeries, type HabitSeries } from "@/lib/domain/development/habit-analytics.ts";
import {
  areaOfCategory,
  areaRates,
  dailyCurve,
  disciplineIndex,
  habitRows,
  momentum,
  monthGrid,
  monthlyTrend,
  periodRates,
  solidDaysStreak,
  streakSegments,
  successRate,
  weeklyTrend,
  type DayPoint,
  type HabitRow,
  type PeriodRates,
  type Rango,
  type StreakSegment,
  type WeekPoint
} from "@/lib/domain/development/habit-dashboard.ts";

/**
 * Las series de todos los hábitos del usuario en [from, to], listas para el
 * dominio.
 *
 * El histórico sale de `habit_log_series` y no de un `select` sobre
 * `habit_logs`: `max_rows = 1000` corta en silencio, y un año de diez hábitos
 * ya son 3.650 filas. En arreglos es una fila por hábito (D-162).
 *
 * Aquí no hay aritmética: solo se leen filas y se traduce `created_at` a la
 * fecha LOCAL del usuario, que es la que entiende el dominio. Un hábito creado
 * a las 11 de la noche en México ya es «mañana» en UTC.
 */
export const loadHabitSeries = cache(async (fromISO: string, toISO: string): Promise<HabitSeries[]> => {
  const supabase = await createClient();
  const [timeZone, { data: habits }, { data: routines }, { data: rows }] = await Promise.all([
    getUserTimeZone(),
    supabase.from("habits").select("id, routine_id, created_at").order("position"),
    supabase.from("routines").select("id, frequency"),
    supabase.rpc("habit_log_series", { p_from: fromISO, p_to: toISO })
  ]);

  const frecuencia = new Map((routines ?? []).map((r) => [r.id, r.frequency as Frequency]));

  return buildHabitSeries(
    (habits ?? []).map((h) => ({
      id: h.id,
      frequency: frecuencia.get(h.routine_id) ?? "Diario",
      createdOn: todayInTimeZone(timeZone, new Date(h.created_at))
    })),
    rows ?? []
  );
});

export interface HabitMeta {
  id: string;
  name: string;
  category: string;
}

/** Nombre y categoría de cada hábito, en el orden en que la persona los ve. */
export const loadHabitMeta = cache(async (): Promise<HabitMeta[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("habits").select("id, name, category").order("position");
  return data ?? [];
});

export interface DashboardRow extends HabitRow {
  name: string;
  category: string;
}

export interface HeatMonth {
  month: string;
  weeks: ({ date: string; pct: number | null } | null)[][];
}

/** Todo lo que pinta la pestaña Analítica, ya calculado y serializable. */
export interface HabitDashboard {
  today: string;
  rango: Rango;
  from: string;
  hasHabits: boolean;
  /** Días con datos desde el hábito más antiguo; por debajo de 7 se avisa. */
  daysOfData: number;
  solidStreak: number;
  periods: PeriodRates;
  monthTrend: { current: number | null; previous: number | null; delta: number | null };
  success: number | null;
  discipline: number | null;
  momentum: number | null;
  best: { value: number; unit: "día" | "semana"; habitName: string } | null;
  curve: DayPoint[];
  weeks: WeekPoint[];
  heatmap: HeatMonth[];
  segments: (StreakSegment & { habitName: string })[];
  areas: { area: string; pct: number | null }[];
  rows: DashboardRow[];
}

/** Cuánto histórico se lee: el año del rango más largo, el trimestre de la tasa90 y el mes previo de la tendencia. */
const VENTANA = 400;

/**
 * La pestaña Analítica completa. Solo lee y delega: toda cifra sale de
 * `habit-dashboard.ts`, que es donde se prueba.
 */
export async function loadDashboard(rango: Rango): Promise<HabitDashboard> {
  const today = await todayForUser();
  const [series, meta] = await Promise.all([loadHabitSeries(addDaysISO(today, -VENTANA), today), loadHabitMeta()]);
  const porId = new Map(meta.map((m) => [m.id, m]));

  // El rango no empieza antes del primer hábito. Las tasas ya ignoran lo
  // anterior (`slotStates` recorta por `createdOn`), pero las gráficas no: con
  // «1 año» y tres meses de hábitos, nueve meses de heatmap vacío y una curva
  // pegada al borde derecho no dicen nada.
  const masAntiguo = series.map((s) => s.createdOn).sort()[0];
  const inicioRango = addDaysISO(today, -(rango - 1));
  const from = masAntiguo && masAntiguo > inicioRango ? masAntiguo : inicioRango;

  // Una sola curva sirve a todo: al rango, a los 30 días de disciplina, a los
  // meses del heatmap (que empiezan el día 1 del mes de `from`) y a la racha de
  // días sólidos, que no puede cortarse donde acaba el rango de 7 días.
  const desdeCurva = [addDaysISO(today, -364), `${from.slice(0, 7)}-01`].sort()[0]!;
  const curvaEntera = dailyCurve(series, desdeCurva, today, today);
  const curva = curvaEntera.filter((p) => p.date >= from);
  const pctPorDia = new Map(curvaEntera.map((p) => [p.date, p.pct]));

  const rows = habitRows(series, from, today)
    .map((r) => ({ ...r, name: porId.get(r.habitId)?.name ?? "Hábito", category: porId.get(r.habitId)?.category ?? "Otros" }))
    .sort((a, b) => (b.consistency ?? -1) - (a.consistency ?? -1));

  const mejor = rows.reduce<DashboardRow | null>((m, r) => (r.longest > (m?.longest ?? 0) ? r : m), null);

  const meses: string[] = [];
  for (let m = from.slice(0, 7); m <= today.slice(0, 7); m = addDaysISO(`${m}-28`, 7).slice(0, 7)) meses.push(m);

  return {
    today,
    rango,
    from,
    hasHabits: series.length > 0,
    daysOfData: masAntiguo ? Math.max(0, diffDays(masAntiguo, today) + 1) : 0,
    solidStreak: solidDaysStreak(curvaEntera, today),
    periods: periodRates(series, today),
    monthTrend: monthlyTrend(series, today),
    success: successRate(series, from, today, today),
    discipline: disciplineIndex(curvaEntera, today),
    momentum: momentum(series, today),
    best: mejor && mejor.longest > 0 ? { value: mejor.longest, unit: mejor.unit, habitName: mejor.name } : null,
    curve: curva,
    // Con 7 días, una sola semana no dibuja tendencia: se enseñan ocho.
    weeks: weeklyTrend(series, rango === 7 ? addDaysISO(today, -55) : from, today),
    heatmap: meses.slice(-12).map((month) => ({
      month,
      weeks: monthGrid(month).map((w) =>
        w.map((date) => (date === null ? null : { date, pct: date > today ? null : pctPorDia.get(date) ?? null }))
      )
    })),
    segments: streakSegments(series, from, today).map((s) => ({ ...s, habitName: porId.get(s.habitId)?.name ?? "Hábito" })),
    areas: areaRates(series, (id) => areaOfCategory(porId.get(id)?.category ?? "Otros"), today),
    rows
  };
}
