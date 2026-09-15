// src/lib/data/identity.ts
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { getUserTimeZone, todayForUser } from "@/lib/data/profile";
import { loadSourceSnapshot } from "@/lib/data/development";
import { addDaysISO } from "@/lib/domain/datetime.ts";
import type { IdentityScore } from "@/lib/domain/identity/score.ts";
import { loadScoreContext, scoreOf, type TraitRow } from "@/lib/identity/score-inputs";
import { briefDeFila, type BriefView } from "@/lib/identity/brief-view";

export interface IdentityProfileLite {
  desiredIdentity: string;
  visionStatement: string;
  coreValues: string[];
  motivationalTone: "sereno" | "directo" | "intenso";
  inspirations: string[];
}

export interface IdentityOverview {
  today: string;
  profile: IdentityProfileLite | null;
  traits: TraitRow[];
  /** Por qué rasgos vota cada hábito. */
  votesByHabit: Record<string, string[]>;
  habits: { id: string; name: string; category: string }[];
  score: IdentityScore;
  /** Puntos frente a la foto de hace una semana, o null si no la hay. */
  delta7: number | null;
  history: { date: string; score: number }[];
  /** Identidades escritas en las rutinas, para sugerir rasgos al empezar. */
  routineIdentities: string[];
}

/** El brief de identidad de hoy, si ya se generó. */
export const loadTodayBrief = cache(async (): Promise<BriefView | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("identity_briefs")
    .select("*")
    .eq("user_id", user.id)
    .eq("local_date", await todayForUser())
    .maybeSingle();
  return data ? briefDeFila(data) : null;
});

/**
 * La identidad de la persona que mira la pantalla: perfil, rasgos, votos, la
 * puntuación de hoy calculada al vuelo y las fotos de las noches anteriores.
 */
export const loadIdentityOverview = cache(async (): Promise<IdentityOverview | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const [today, timeZone, sources] = await Promise.all([todayForUser(), getUserTimeZone(), loadSourceSnapshot()]);

  const [ctx, { data: profile }, { data: history }, { data: rutinas }] = await Promise.all([
    loadScoreContext({ supabase, userId: user.id, today, timeZone, modo: "sesion", sources }),
    supabase.from("identity_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("identity_scores")
      .select("local_date, score")
      .eq("user_id", user.id)
      .gte("local_date", addDaysISO(today, -364))
      .order("local_date"),
    supabase.from("routines").select("identity").eq("user_id", user.id).neq("identity", "")
  ]);

  const score = scoreOf(ctx);
  const hace7 = addDaysISO(today, -7);
  // La foto más reciente que no sea más nueva que hace una semana: si una noche
  // el reloj no pasó, se compara con la anterior en vez de no comparar.
  const referencia = [...(history ?? [])].reverse().find((h) => h.local_date <= hace7);

  const votesByHabit: Record<string, string[]> = {};
  for (const v of ctx.inputs.votes) votesByHabit[v.habitId] = [...(votesByHabit[v.habitId] ?? []), v.traitId];

  return {
    today,
    profile: profile
      ? {
          desiredIdentity: profile.desired_identity,
          visionStatement: profile.vision_statement,
          coreValues: profile.core_values,
          motivationalTone: profile.motivational_tone as IdentityProfileLite["motivationalTone"],
          inspirations: profile.inspirations
        }
      : null,
    traits: ctx.traits,
    votesByHabit,
    habits: ctx.habits,
    score,
    delta7: score.score !== null && referencia ? score.score - referencia.score : null,
    history: [
      ...(history ?? []).filter((h) => h.local_date !== today).map((h) => ({ date: h.local_date, score: h.score })),
      ...(score.score !== null ? [{ date: today, score: score.score }] : [])
    ],
    routineIdentities: [...new Set((rutinas ?? []).map((r) => r.identity.trim()).filter(Boolean))]
  };
});
