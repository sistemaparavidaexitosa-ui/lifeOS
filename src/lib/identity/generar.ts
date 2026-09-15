// src/lib/identity/generar.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { BRIEF_BUDGET, generateJson } from "@/lib/ai/gemini-provider";
import { loadFacts } from "@/lib/insights/facts-loader";
import { buildContext } from "@/lib/insights/context";
import { addDaysISO, todayInTimeZone } from "@/lib/domain/datetime.ts";
import { completionRate } from "@/lib/domain/development/habit-analytics.ts";
import { dailyCurve, solidDaysStreak } from "@/lib/domain/development/habit-dashboard.ts";
import type { SourceSnapshot } from "@/lib/domain/development/goals.ts";
import { sanearBrief, type Brief } from "@/lib/domain/identity/brief.ts";
import { identityFacts } from "@/lib/domain/insights/facts/identity.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";
import type { MemoryItemLike, MemoryScope } from "@/lib/domain/insights/memory.ts";
import { loadScoreContext, scoreOf } from "./score-inputs";
import { BRIEF_RESPONSE_SCHEMA, BriefSchema, promptDelBrief, systemDelBrief, type DatosDelBrief } from "./prompt";

type Db = SupabaseClient<Database>;

/** Los dos dominios sin los que no hay brief: la identidad vive en `growth` y la acción en `habits`. */
export const DOMINIOS_DEL_BRIEF: Domain[] = ["habits", "growth"];

export interface BriefGenerado {
  ok: boolean;
  brief?: Brief;
  model?: string;
  factCount?: number;
  intentos?: number;
  reason?: string;
}

/**
 * Genera el brief de identidad de HOY para una persona, sin guardarlo.
 *
 * Mismo reparto que el coach: aquí se reúne el contexto, se llama al modelo y
 * se sanea; guardar lo decide la acción. NUNCA LANZA (D-021): cualquier fallo
 * vuelve como `reason` legible.
 *
 * Un reintento como mucho, y solo si el saneado encontró algo que corregir
 * (afirmaciones repetidas, cita atribuida, piezas vacías). El reintento lleva
 * los problemas escritos para que el modelo sepa qué cambiar, no una tirada
 * más a ciegas.
 */
export async function generarBrief(opts: {
  supabase: Db;
  userId: string;
  today: string;
  timeZone: string;
  sources: SourceSnapshot;
}): Promise<BriefGenerado> {
  try {
    return await generar(opts);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "No se pudo generar el brief." };
  }
}

async function generar({ supabase, userId, today, timeZone, sources }: Parameters<typeof generarBrief>[0]): Promise<BriefGenerado> {
  const desde30 = addDaysISO(today, -30);
  const [{ data: profile }, { data: identidad }] = await Promise.all([
    supabase.from("profiles").select("quincenal_income, ai_domains, activity_window_start, activity_window_end").eq("user_id", userId).maybeSingle(),
    supabase.from("identity_profiles").select("*").eq("user_id", userId).maybeSingle()
  ]);

  if (!identidad?.desired_identity) {
    return { ok: false, reason: "Primero di en quién te estás convirtiendo: tu brief se escribe a partir de eso." };
  }

  // El opt-in manda (§4.2). Sin estos dos dominios no hay de qué escribir, y un
  // brief sin datos sería exactamente el texto genérico que no queremos.
  const enabled = (profile?.ai_domains ?? []) as Domain[];
  const apagados = DOMINIOS_DEL_BRIEF.filter((d) => !enabled.includes(d));
  if (apagados.length) {
    return {
      ok: false,
      reason: "Tu brief necesita que Hábitos y Desarrollo personal estén encendidos para la IA. Enciéndelos en Configuración."
    };
  }

  const [ctx, { data: memoria }, { data: previos }, { data: revision }, { data: metas }, { data: rutinas }, { data: reflexiones }, { data: aprendizajes }, { data: fotos }] =
    await Promise.all([
      loadScoreContext({ supabase, userId, today, timeZone, modo: "sesion", sources }),
      supabase.from("memory_items").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("identity_briefs").select("local_date, affirmations, reactions").eq("user_id", userId).gte("local_date", desde30).lt("local_date", today).order("local_date", { ascending: false }),
      supabase.from("identity_revisions").select("desired_identity").eq("user_id", userId).order("changed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("personal_goals").select("id, title, achieved_at").eq("user_id", userId).eq("status", "Lograda").gte("achieved_at", `${addDaysISO(today, -14)}T00:00:00Z`),
      supabase.from("routines").select("name, identity").eq("user_id", userId).eq("active", true),
      supabase.from("daily_reflections").select("local_date, reflection, wins").eq("user_id", userId).gte("local_date", addDaysISO(today, -7)).order("local_date", { ascending: false }),
      supabase.from("logbook").select("text, created_at").eq("user_id", userId).eq("type", "learning").gte("created_at", `${addDaysISO(today, -8)}T00:00:00Z`),
      supabase.from("identity_scores").select("local_date, score").eq("user_id", userId).lte("local_date", addDaysISO(today, -7)).order("local_date", { ascending: false }).limit(1)
    ]);

  const score = scoreOf(ctx);
  const hechosIdentidad = identityFacts({
    today,
    habits: ctx.habits,
    series: ctx.series,
    traits: ctx.traits,
    votes: ctx.inputs.votes,
    score: score.score,
    scoreWeekAgo: fotos?.[0]?.score ?? null,
    goalsAchieved: (metas ?? [])
      .filter((g) => g.achieved_at)
      .map((g) => ({ id: g.id, title: g.title, achievedOn: todayInTimeZone(timeZone, new Date(g.achieved_at!)) })),
    solidStreak: solidDaysStreak(dailyCurve(ctx.series, addDaysISO(today, -60), today, today), today)
  });

  const hechosDominio = await loadFacts(supabase, userId, DOMINIOS_DEL_BRIEF, today, {
    quincenalIncome: profile?.quincenal_income ?? 0,
    window: {
      start: (profile?.activity_window_start ?? "08:00").slice(0, 5),
      end: (profile?.activity_window_end ?? "18:00").slice(0, 5)
    }
  });

  const context = buildContext({
    scope: "global",
    facts: [...hechosIdentidad, ...hechosDominio],
    enabledDomains: enabled,
    todayISO: today,
    maxFacts: 60,
    memory: (memoria ?? []).map(
      (m): MemoryItemLike => ({
        id: m.id,
        scope: m.scope as MemoryScope,
        origin: m.origin as MemoryItemLike["origin"],
        text: m.text,
        validUntil: m.valid_until
      })
    )
  });

  const porHabitoSerie = new Map(ctx.series.map((s) => [s.habitId, s]));
  const afirmacionesPrevias = (previos ?? []).flatMap((p) => ((p.affirmations as { text: string }[]) ?? []).map((a) => a.text));

  const datos: DatosDelBrief = {
    today,
    identidad: { deseada: identidad.desired_identity, vision: identidad.vision_statement, valores: identidad.core_values },
    revisionAnterior: revision?.desired_identity ?? null,
    rasgos: ctx.traits
      .filter((t) => t.active)
      .map((t) => {
        const suyas = ctx.inputs.votes
          .filter((v) => v.traitId === t.id)
          .map((v) => porHabitoSerie.get(v.habitId))
          .filter((s): s is NonNullable<typeof s> => s !== undefined);
        return {
          id: t.id,
          nombre: t.name,
          frase: t.statement,
          area: t.area,
          cumplimiento: suyas.length ? completionRate(suyas, addDaysISO(today, -29), today, today) : null
        };
      }),
    metas: ctx.goals.map((g) => ({ titulo: g.title, area: g.area, avance: g.progressPct })),
    rutinas: (rutinas ?? []).map((r) => ({ nombre: r.name, identidad: r.identity })),
    hechos: context.facts.map((f) => ({ id: f.id, label: f.label })),
    memoria: context.memory,
    reflexiones: [
      ...(reflexiones ?? [])
        .filter((r) => r.reflection || r.wins)
        .map((r) => ({ fecha: r.local_date, texto: [r.reflection, r.wins && `Logros: ${r.wins}`].filter(Boolean).join(" · ") })),
      ...(aprendizajes ?? []).map((l) => ({ fecha: todayInTimeZone(timeZone, new Date(l.created_at)), texto: `Aprendizaje: ${l.text}` }))
    ].slice(0, 10),
    previos: (previos ?? []).slice(0, 14).map((p) => {
      const afirmaciones = (p.affirmations as { id: string; text: string }[]) ?? [];
      const reacciones = (p.reactions as Record<string, string>) ?? {};
      return {
        fecha: p.local_date,
        afirmaciones: afirmaciones.map((a) => a.text),
        resonaron: afirmaciones.filter((a) => reacciones[a.id] === "resuena").map((a) => a.text),
        noResonaron: afirmaciones.filter((a) => reacciones[a.id] === "no_resuena").map((a) => a.text)
      };
    })
  };

  const saneadoContexto = {
    rasgos: new Set(ctx.traits.filter((t) => t.active).map((t) => t.id)),
    hechos: new Set(context.facts.map((f) => f.id)),
    previas: afirmacionesPrevias
  };

  let modelo: string | undefined;
  let respaldo: Brief | null = null;
  let correcciones: DatosDelBrief["correcciones"];
  for (let intento = 1; intento <= 2; intento++) {
    const result = await generateJson({
      system: systemDelBrief(identidad.motivational_tone, identidad.inspirations),
      prompt: promptDelBrief({ ...datos, correcciones }),
      schema: BRIEF_RESPONSE_SCHEMA,
      budget: BRIEF_BUDGET,
      validate: (raw) => {
        const parsed = BriefSchema.safeParse(raw);
        return parsed.success
          ? ({ ok: true, value: parsed.data } as const)
          : ({ ok: false, reason: "El modelo no devolvió un brief con la forma esperada." } as const);
      }
    });
    modelo = result.model ?? modelo;
    if (!result.ok || !result.data) {
      if (respaldo) break;
      return { ok: false, reason: result.reason, model: modelo, intentos: intento };
    }

    const saneado = sanearBrief(result.data, saneadoContexto);
    if (saneado.ok && saneado.problemas.length === 0) {
      return { ok: true, brief: saneado.brief, model: modelo, factCount: context.facts.length, intentos: intento };
    }
    // Un brief que se sostiene con algún defecto menor (una afirmación de
    // menos, la cita fuera) queda de respaldo; el reintento lleva escrito qué
    // corregir.
    if (saneado.ok) respaldo = saneado.brief!;
    correcciones = { problemas: saneado.problemas, rechazadas: saneado.rechazadas };
  }

  if (respaldo) return { ok: true, brief: respaldo, model: modelo, factCount: context.facts.length, intentos: 2 };
  return {
    ok: false,
    reason: "La IA no consiguió un brief que no repitiera días anteriores. Inténtalo de nuevo en un rato.",
    model: modelo,
    intentos: 2
  };
}

/** Para `audit_log`: cuántos hechos de identidad y de dominio hubo, sin los textos. */
export function resumenParaAuditoria(g: BriefGenerado): Record<string, unknown> {
  return { model: g.model ?? null, facts: g.factCount ?? 0, intentos: g.intentos ?? 0, domains: DOMINIOS_DEL_BRIEF };
}
