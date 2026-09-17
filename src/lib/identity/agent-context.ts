// src/lib/identity/agent-context.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { loadFacts } from "@/lib/insights/facts-loader";
import { buildContext } from "@/lib/insights/context";
import { addDaysISO, todayInTimeZone } from "@/lib/domain/datetime.ts";
import { completionRate } from "@/lib/domain/development/habit-analytics.ts";
import { dailyCurve, solidDaysStreak } from "@/lib/domain/development/habit-dashboard.ts";
import type { SourceSnapshot } from "@/lib/domain/development/goals.ts";
import { identityFacts } from "@/lib/domain/insights/facts/identity.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";
import type { MemoryItemLike, MemoryScope } from "@/lib/domain/insights/memory.ts";
import { libroDeEstilo, type DiaMedido, type EtiquetasEstilo, type LibroDeEstilo, type Tono } from "@/lib/domain/identity/estilo.ts";
import { loadScoreContext, scoreOf } from "./score-inputs";
import type { DatosDelBrief } from "./prompt";

/**
 * EL CONTEXTO DEL BRIEF, REUNIDO UNA SOLA VEZ.
 *
 * Lo leen dos caminos que tienen que ver EXACTAMENTE lo mismo:
 *   · el respaldo (`generar.ts`), que llama al modelo desde aquí dentro;
 *   · `/api/agents/manifestation/context`, que se lo sirve al agente Python.
 *
 * Que sea la misma función no es una comodidad, es el requisito. Si el endpoint
 * reuniera el contexto por su cuenta, el agente y el respaldo escribirían a
 * partir de datos distintos, y el libro de estilo —que compara días entre sí—
 * estaría correlacionando estilos contra dos líneas base diferentes sin que
 * nada lo delatara.
 */

type Db = SupabaseClient<Database>;

/** Los dos dominios sin los que no hay brief: la identidad vive en `growth` y la acción en `habits`. */
export const DOMINIOS_DEL_BRIEF: Domain[] = ["habits", "growth"];

export interface ContextoDelBrief {
  /** Lo que consume el prompt del respaldo, y la base de lo que se le manda a Python. */
  datos: DatosDelBrief;
  /** Los conjuntos con los que `sanearBrief` comprueba que nada esté inventado. */
  saneado: { rasgos: Set<string>; hechos: Set<string>; previas: string[] };
  /** Preferencias de tono y principios que eligió la persona. */
  preferencias: { tono: Tono; inspiraciones: string[] };
  /** Lo aprendido sobre cómo escribirle (D-164). Vacío hasta que haya días medidos. */
  estilo: LibroDeEstilo;
  factCount: number;
  /** Null mientras no haya datos suficientes para calcularlo. */
  identityScore: number | null;
}

export type ResultadoContexto = { ok: true; contexto: ContextoDelBrief } | { ok: false; reason: string };

/**
 * Reúne todo lo que hace falta para escribir el brief de hoy.
 *
 * NUNCA LANZA hacia fuera por los dos motivos previsibles —no hay identidad
 * declarada, o la IA está apagada para estos dominios—: los devuelve como
 * `reason` en español, que es lo que se le enseña a la persona tal cual. Un
 * fallo de base de datos sí propaga, porque ahí no hay nada que decirle.
 */
export async function loadContextoDelBrief(opts: {
  supabase: Db;
  userId: string;
  today: string;
  timeZone: string;
  sources: SourceSnapshot;
  /** «sesion» usa la RLS; «servicio» filtra `user_id` a mano. */
  modo: "sesion" | "servicio";
}): Promise<ResultadoContexto> {
  const { supabase, userId, today, timeZone, sources, modo } = opts;
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
  //
  // ESTA COMPROBACIÓN ES LA PUERTA DE PRIVACIDAD, y vive aquí precisamente
  // porque ahora hay dos caminos que la cruzan. Cuando solo existía la Server
  // Action bastaba con tenerla allí; con un endpoint que sirve el contexto a un
  // servicio externo, dejarla fuera de esta función sería abrir una puerta
  // trasera al opt-in de la persona.
  const enabled = (profile?.ai_domains ?? []) as Domain[];
  const apagados = DOMINIOS_DEL_BRIEF.filter((d) => !enabled.includes(d));
  if (apagados.length) {
    return {
      ok: false,
      reason: "Tu brief necesita que Hábitos y Desarrollo personal estén encendidos para la IA. Enciéndelos en Configuración."
    };
  }

  const [ctx, { data: memoria }, { data: previos }, { data: revision }, { data: metas }, { data: rutinas }, { data: reflexiones }, { data: aprendizajes }, { data: fotos }, { data: estilos }] =
    await Promise.all([
      loadScoreContext({ supabase, userId, today, timeZone, modo, sources }),
      supabase.from("memory_items").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("identity_briefs").select("local_date, affirmations, reactions, mantra").eq("user_id", userId).gte("local_date", desde30).lt("local_date", today).order("local_date", { ascending: false }),
      supabase.from("identity_revisions").select("desired_identity").eq("user_id", userId).order("changed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("personal_goals").select("id, title, achieved_at").eq("user_id", userId).eq("status", "Lograda").gte("achieved_at", `${addDaysISO(today, -14)}T00:00:00Z`),
      supabase.from("routines").select("name, identity").eq("user_id", userId).eq("active", true),
      supabase.from("daily_reflections").select("local_date, reflection, wins").eq("user_id", userId).gte("local_date", addDaysISO(today, -7)).order("local_date", { ascending: false }),
      supabase.from("logbook").select("text, created_at").eq("user_id", userId).eq("type", "learning").gte("created_at", `${addDaysISO(today, -8)}T00:00:00Z`),
      supabase.from("identity_scores").select("local_date, score").eq("user_id", userId).lte("local_date", addDaysISO(today, -7)).order("local_date", { ascending: false }).limit(1),
      // El libro de estilo mira más atrás que el resto: necesita días MEDIDOS,
      // y solo los hay a partir de la noche siguiente a cada brief.
      supabase
        .from("identity_brief_style")
        .select("local_date, tone, length_bucket, scene_kind, uses_numbers, category_mix, affirmation_count, outcome_score")
        .eq("user_id", userId)
        .not("outcome_score", "is", null)
        .gte("local_date", addDaysISO(today, -90))
        .order("local_date", { ascending: false })
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
        noResonaron: afirmaciones.filter((a) => reacciones[a.id] === "no_resuena").map((a) => a.text),
        mantra: p.mantra
      };
    })
  };

  const dias: DiaMedido[] = (estilos ?? []).map((e) => ({
    localDate: e.local_date,
    etiquetas: {
      tone: e.tone as EtiquetasEstilo["tone"],
      lengthBucket: e.length_bucket as EtiquetasEstilo["lengthBucket"],
      sceneKind: e.scene_kind as EtiquetasEstilo["sceneKind"],
      usesNumbers: e.uses_numbers,
      categoryMix: (e.category_mix ?? []) as EtiquetasEstilo["categoryMix"],
      affirmationCount: e.affirmation_count
    },
    outcomeScore: e.outcome_score!
  }));

  return {
    ok: true,
    contexto: {
      datos,
      saneado: {
        rasgos: new Set(ctx.traits.filter((t) => t.active).map((t) => t.id)),
        hechos: new Set(context.facts.map((f) => f.id)),
        previas: afirmacionesPrevias
      },
      preferencias: { tono: identidad.motivational_tone as Tono, inspiraciones: identidad.inspirations },
      estilo: libroDeEstilo(dias),
      factCount: context.facts.length,
      identityScore: score.score
    }
  };
}
