// src/lib/identity/score-inputs.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { addDaysISO, todayInTimeZone } from "@/lib/domain/datetime.ts";
import { buildHabitSeries, type HabitSeries } from "@/lib/domain/development/habit-analytics.ts";
import { routineAdherence, type Frequency } from "@/lib/domain/development/routines.ts";
import { goalProgress, keyResultProgress, type SourceSnapshot } from "@/lib/domain/development/goals.ts";
import { identityScore, resolveHabitAreas, type IdentityScore, type ScoreInputs } from "@/lib/domain/identity/score.ts";

type Db = SupabaseClient<Database>;

export interface TraitRow {
  id: string;
  name: string;
  statement: string;
  area: string;
  position: number;
  active: boolean;
}

export interface ScoreContext {
  inputs: ScoreInputs;
  /** Metas activas con su avance, en el mismo orden que `inputs.goals`. */
  goals: { id: string; title: string; area: string; progressPct: number }[];
  habits: { id: string; name: string; category: string }[];
  traits: TraitRow[];
  series: HabitSeries[];
}

/**
 * Todo lo que necesita el Identity Score de UNA persona, leído una vez.
 *
 * Lo llaman dos caminos: la pantalla, con la sesión y la RLS puestas, y el
 * reloj de la noche, con el cliente de servicio que SALTA la RLS. Por eso cada
 * consulta filtra por `userId` a mano, incluso cuando la RLS lo haría sola
 * (misma regla que `src/lib/coach/facts.ts`), y el histórico sale de
 * `habit_log_series` o de su `_de` según el camino. Una sola carga para los
 * dos garantiza que la foto nocturna y el número de la pantalla se calculan
 * con los mismos datos.
 *
 * `sources` resuelve el avance de los resultados clave: `loadSourceSnapshot`
 * con sesión, `fuentesDe` sin ella.
 */
export async function loadScoreContext(opts: {
  supabase: Db;
  userId: string;
  today: string;
  timeZone: string;
  modo: "sesion" | "servicio";
  sources: SourceSnapshot;
}): Promise<ScoreContext> {
  const { supabase, userId, today, timeZone, modo, sources } = opts;
  const desdeSerie = addDaysISO(today, -120);
  const desde30 = addDaysISO(today, -29);
  const desde14 = addDaysISO(today, -13);

  const serieRpc =
    modo === "servicio"
      ? supabase.rpc("habit_log_series_de", { p_uid: userId, p_from: desdeSerie, p_to: today })
      : supabase.rpc("habit_log_series", { p_from: desdeSerie, p_to: today });

  const [
    { data: habits },
    { data: routines },
    { data: traits },
    { data: votes },
    { data: goals },
    { data: runs },
    { data: reflexiones },
    { data: aprendizajes },
    { data: rows }
  ] = await Promise.all([
    supabase.from("habits").select("id, name, category, routine_id, created_at").eq("user_id", userId).order("position"),
    supabase.from("routines").select("id, frequency, active").eq("user_id", userId),
    supabase.from("identity_traits").select("id, name, statement, area, position, active").eq("user_id", userId).order("position"),
    supabase.from("habit_identity_traits").select("habit_id, trait_id, habits!inner(user_id)").eq("habits.user_id", userId),
    supabase.from("personal_goals").select("id, title, area, created_at, horizon").eq("user_id", userId).eq("status", "Activa"),
    supabase
      .from("routine_runs")
      .select("routine_id, local_date, routines!inner(user_id)")
      .eq("routines.user_id", userId)
      .not("completed_at", "is", null)
      .gte("local_date", desde30)
      .lte("local_date", today),
    supabase.from("daily_reflections").select("local_date").eq("user_id", userId).gte("local_date", desde14).lte("local_date", today),
    // Un día de margen hacia atrás: `created_at` es UTC y el día local se
    // decide abajo con la zona del perfil.
    supabase
      .from("logbook")
      .select("created_at")
      .eq("user_id", userId)
      .eq("type", "learning")
      .gte("created_at", `${addDaysISO(desde14, -1)}T00:00:00Z`),
    serieRpc
  ]);

  const frecuencia = new Map((routines ?? []).map((r) => [r.id, r.frequency as Frequency]));
  const series = buildHabitSeries(
    (habits ?? []).map((h) => ({
      id: h.id,
      frequency: frecuencia.get(h.routine_id) ?? "Diario",
      createdOn: todayInTimeZone(timeZone, new Date(h.created_at))
    })),
    rows ?? []
  );

  const goalIds = (goals ?? []).map((g) => g.id);
  const { data: krs } = goalIds.length
    ? await supabase.from("key_results").select("*").in("goal_id", goalIds)
    : { data: [] as Database["public"]["Tables"]["key_results"]["Row"][] };

  const votos = (votes ?? []).map((v) => ({ habitId: v.habit_id, traitId: v.trait_id }));
  const rasgos: TraitRow[] = traits ?? [];

  const inputs: ScoreInputs = {
    today,
    series,
    habitAreas: resolveHabitAreas(habits ?? [], rasgos, votos),
    traits: rasgos.map((t) => ({ id: t.id, active: t.active })),
    votes: votos,
    goals: (goals ?? []).map((g) => ({
      progressPct: goalProgress(
        (krs ?? [])
          .filter((k) => k.goal_id === g.id)
          .map((k) =>
            keyResultProgress(
              {
                id: k.id,
                sourceKind: k.source_kind as "habit" | "project" | "book" | "financial_goal" | "manual",
                sourceId: k.source_id,
                target: Number(k.target),
                manualCurrent: Number(k.manual_current)
              },
              sources
            )
          )
      ),
      startISO: todayInTimeZone(timeZone, new Date(g.created_at)),
      horizonISO: g.horizon
    })),
    routineAdherence: (routines ?? [])
      .filter((r) => r.active)
      .map((r) =>
        routineAdherence(
          (runs ?? []).filter((x) => x.routine_id === r.id).map((x) => x.local_date),
          r.frequency as Frequency,
          desde30,
          today
        )
      ),
    reflectionDays: [
      ...(reflexiones ?? []).map((r) => r.local_date),
      ...(aprendizajes ?? []).map((l) => todayInTimeZone(timeZone, new Date(l.created_at)))
    ]
  };

  return {
    inputs,
    goals: (goals ?? []).map((g, i) => ({ id: g.id, title: g.title, area: g.area, progressPct: inputs.goals[i]!.progressPct })),
    habits: (habits ?? []).map((h) => ({ id: h.id, name: h.name, category: h.category })),
    traits: rasgos,
    series
  };
}

export function scoreOf(ctx: ScoreContext): IdentityScore {
  return identityScore(ctx.inputs);
}
