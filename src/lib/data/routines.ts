import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO } from "@/lib/data/dates";
import { todayForUser } from "@/lib/data/profile";
import {
  routineDueToday,
  routineProgress,
  routineFitsBlock,
  routineAdherence,
  type Frequency
} from "@/lib/domain/development/routines.ts";
import { habitStreaks, slotStates, type HabitLogEntry } from "@/lib/domain/development/habit-analytics.ts";
import { dailyCurve, periodRates, solidDaysStreak } from "@/lib/domain/development/habit-dashboard.ts";
import { loadHabitSeries } from "@/lib/data/habit-analytics";

/**
 * Las rutinas de hoy, con el estado real de cada hábito.
 *
 * ESTO VIVÍA DENTRO DE `src/app/(app)/development/routines/page.tsx`, que era el
 * único sitio que lo necesitaba. Dejó de serlo cuando el arranque guiado (D-165)
 * tuvo que saber qué hábito toca ahora: la alternativa era copiar seis consultas
 * y el cálculo de rachas a un segundo archivo, y a la primera divergencia el
 * ritual diría que un hábito está pendiente mientras la pantalla de rutinas lo
 * da por hecho.
 *
 * NO DEVUELVE JSX. La página sigue siendo la dueña de lo que se pinta —incluido
 * el botón de edición que cuelga de cada fila—; aquí solo hay datos, que es lo
 * que el overlay del ritual puede consumir sin arrastrar media pantalla de
 * rutinas detrás.
 *
 * Envuelta en `cache()` de React: `/development/routines` y la puerta del ritual
 * la piden dentro del mismo request y solo se consulta una vez.
 */
export interface HabitoDeRutina {
  id: string;
  name: string;
  category: string;
  /** Si el hábito ES una comida (0047), su nombre. `null` si no lo es. */
  meal: string | null;
  durationMin: number;
  position: number;
  cue: string;
  twoMinVersion: string;
  stackAfterHabitId: string | null;
  stackAfterName: string | null;
  /** El registro de hoy en cualquier estado (0063), o `null`. */
  todayEntry: HabitLogEntry | null;
  weekDoneElsewhere: boolean;
  streak: number;
  streakUnit: "día" | "semana";
  recent: HabitLogEntry[];
}

export interface OcupacionDeRutina {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
}

export interface RutinaDeHoy {
  routine: {
    id: string;
    name: string;
    frequency: Frequency;
    occupationId: string | null;
    identity: string;
    active: boolean;
    position: number;
  };
  habits: HabitoDeRutina[];
  due: boolean;
  progress: ReturnType<typeof routineProgress>;
  fits: boolean;
  occ: OcupacionDeRutina | null;
  adherence: number;
}

export const loadRoutinesForToday = cache(async () => {
  const supabase = await createClient();

  // "Hoy" se calcula ANTES de consultar: la ventana de adherencia depende de él.
  const today = await todayForUser();
  const from = addDaysISO(today, -29);
  // El histórico llega en arreglos por hábito (`habit_log_series`, 0063): una
  // consulta normal choca con `max_rows = 1000`, que trunca SIN avisar y en un
  // orden que nadie fija. 400 días acotan cualquier racha que se sepa dibujar.
  const desdeLogs = addDaysISO(today, -399);
  // La hoja de detalle deja registrar hasta una semana atrás (ver `logHabit`).
  const desdeDetalle = addDaysISO(today, -7);

  const [{ data: routines }, { data: habits }, { data: occupations }, { data: runs }, { data: notas }, series] =
    await Promise.all([
      supabase.from("routines").select("*").order("position"),
      supabase.from("habits").select("*").order("position"),
      supabase.from("occupations").select("id, title, start_time, end_time"),
      supabase.from("routine_runs").select("*").gte("local_date", from).lte("local_date", today),
      // Las notas no viajan en la serie: solo hacen falta las de la última semana.
      supabase.from("habit_logs").select("habit_id, log_date, note").gte("log_date", desdeDetalle).neq("note", ""),
      loadHabitSeries(desdeLogs, today)
    ]);

  const occById = new Map((occupations ?? []).map((o) => [o.id, o]));
  const habitById = new Map((habits ?? []).map((h) => [h.id, h.name]));
  const seriePorHabito = new Map(series.map((s) => [s.habitId, s]));
  const notaPorDia = new Map((notas ?? []).map((n) => [`${n.habit_id}:${n.log_date}`, n.note]));

  /** Lo que la fila necesita de la serie: el registro de hoy, la semana y la racha. */
  function estadoDe(habitId: string) {
    const s = seriePorHabito.get(habitId);
    if (!s) {
      return { todayEntry: null, weekDoneElsewhere: false, streak: { current: 0, unit: "día" as const }, recent: [] };
    }
    const recent: HabitLogEntry[] = s.logs
      .filter((l) => l.date >= desdeDetalle)
      .map((l) => ({ ...l, note: notaPorDia.get(`${habitId}:${l.date}`) ?? "" }));
    const todayEntry = recent.find((l) => l.date === today) ?? null;
    const ranuraActual = slotStates(s, today, today, today)[0];
    return {
      todayEntry,
      weekDoneElsewhere: s.frequency === "Semanal" && ranuraActual?.state === "completed",
      streak: habitStreaks(s, today, desdeLogs),
      recent
    };
  }

  const estados = new Map((habits ?? []).map((h) => [h.id, estadoDe(h.id)]));
  const doneToday = new Set(
    (habits ?? []).filter((h) => estados.get(h.id)?.todayEntry?.status === "completed").map((h) => h.id)
  );

  const rows: RutinaDeHoy[] = (routines ?? []).map((r) => {
    const own = (habits ?? []).filter((h) => h.routine_id === r.id);
    const habitLikes = own.map((h) => ({ id: h.id, durationMin: h.duration_min }));
    const occ = r.occupation_id ? occById.get(r.occupation_id) ?? null : null;
    const block = occ ? { start: occ.start_time, end: occ.end_time } : null;
    const completedDates = (runs ?? [])
      .filter((x) => x.routine_id === r.id && x.completed_at !== null)
      .map((x) => x.local_date);
    const doneIds = own.filter((h) => doneToday.has(h.id)).map((h) => h.id);

    return {
      routine: {
        id: r.id,
        name: r.name,
        frequency: r.frequency as Frequency,
        occupationId: r.occupation_id,
        identity: r.identity,
        active: r.active,
        position: r.position
      },
      habits: own.map<HabitoDeRutina>((h) => {
        const estado = estados.get(h.id) ?? estadoDe(h.id);
        return {
          id: h.id,
          name: h.name,
          category: h.category,
          meal: h.meal,
          durationMin: h.duration_min,
          position: h.position,
          cue: h.cue,
          twoMinVersion: h.two_min_version,
          stackAfterHabitId: h.stack_after_habit_id,
          stackAfterName: h.stack_after_habit_id ? habitById.get(h.stack_after_habit_id) ?? null : null,
          todayEntry: estado.todayEntry,
          weekDoneElsewhere: estado.weekDoneElsewhere,
          streak: estado.streak.current,
          streakUnit: estado.streak.unit,
          recent: estado.recent
        };
      }),
      due: routineDueToday(r.frequency as Frequency, today),
      progress: routineProgress(doneIds, habitLikes),
      fits: routineFitsBlock(habitLikes, block),
      occ,
      adherence: routineAdherence(completedDates, r.frequency as Frequency, from, today)
    };
  });

  // Las tres cifras del día salen de las mismas funciones que Analítica: si la
  // pantalla dice 80 % y allí 78 %, el fallo estaría en un solo sitio.
  const periodos = periodRates(series, today);
  const diasSolidos = solidDaysStreak(dailyCurve(series, addDaysISO(today, -120), today, today), today);

  return {
    today,
    from,
    desdeLogs,
    desdeDetalle,
    rows,
    occupations: (occupations ?? []) as OcupacionDeRutina[],
    /**
     * Candidatos para apilar: TODOS los hábitos del usuario, de cualquier
     * rutina. El apilamiento puede cruzar rutinas; el orden solo describe el de
     * la propia.
     */
    habitOptions: (habits ?? []).map((h) => ({ id: h.id, name: h.name })),
    periodos,
    diasSolidos
  };
});
