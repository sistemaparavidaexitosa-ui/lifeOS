// src/lib/insights/generar-recomendaciones.ts
import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { loadFacts, type FactsOverrides } from "./facts-loader";
import { allowedDomains, buildContext, type InsightContext, type Scope } from "./context";
import { loadChainFacts } from "./graph-context";
import { recommend, type RecommendResult } from "@/lib/ai/recommend";
import { insightsPorElKernel } from "@/config/env";
import { obtenerAgente, ejecutarAgente } from "@/lib/agents/runtime";
import { esSalidaInsights } from "@/lib/agents/insights-nocturno";
import { anotarSilencio, leerTodasLasDecisiones, ultimaRevisionDeIdentidad } from "@/lib/agents/bitacora";
import { INSIGHTS_METADATOS } from "@/lib/domain/agents/insights.ts";
import { convieneActuar } from "@/lib/domain/agents/politicas.ts";
import { acotarContexto } from "@/lib/domain/agents/contexto.ts";
import { enRechazoSostenido } from "@/lib/domain/agents/aprendizaje.ts";
import type { AgentEvent } from "@/lib/domain/agents/types.ts";
import { GEMINI_MODEL } from "@/lib/ai/gemini-provider";
import { recommendationFingerprint } from "@/lib/domain/insights/fingerprint.ts";
import { REJECTION_STATUSES } from "@/lib/domain/insights/states.ts";
import { DOMAIN_LABEL, type Domain } from "@/lib/domain/insights/types.ts";
import type { MemoryItemLike, MemoryScope } from "@/lib/domain/insights/memory.ts";
import { describeDbError } from "@/lib/supabase/errors";

/**
 * EL ANÁLISIS, SIN SABER QUIÉN LO PIDE.
 *
 * Era el cuerpo de `analyze()` (insights/actions.ts), atado a la sesión. Los
 * insights nocturnos (F5) necesitan exactamente lo mismo desde el reloj, sin
 * sesión, y copiarlo habría dejado dos análisis condenados a divergir. Así que
 * se parte en dos y se parametriza:
 *
 *   1. `prepararAnalisis`: opt-in → hechos → cadenas → contexto. Sin modelo.
 *      El reloj lo usa para calcular la huella de los hechos y NO llamar al
 *      modelo si nada cambió desde la última noche.
 *   2. `recomendarYGuardar`: modelo → anclaje → deduplicación → escritura.
 *
 * Con el cliente de servicio la RLS no está puesta: cada consulta filtra por
 * `userId` a mano, como en `coach/facts.ts`, y con sesión el filtro sobra pero
 * no estorba.
 */

type Db = SupabaseClient<Database>;

export interface AnalyzeResult {
  ok: boolean;
  created: number;
  /** Mensaje para la UI: por qué no hubo recomendaciones, si no las hubo. */
  reason?: string;
}

export type Preparacion = { ok: true; context: InsightContext } | { ok: false; reason: string };

export async function prepararAnalisis(opts: {
  supabase: Db;
  userId: string;
  scope: Scope;
  today: string;
  modo: "sesion" | "servicio";
  overrides?: FactsOverrides;
}): Promise<Preparacion> {
  const { supabase, userId, scope, today, modo } = opts;

  const [{ data: profile }, { data: rejected }, { data: memory }] = await Promise.all([
    supabase
      .from("profiles")
      .select("quincenal_income, ai_domains, activity_window_start, activity_window_end")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("recommendations")
      .select("status, text")
      .eq("user_id", userId)
      .in("status", REJECTION_STATUSES)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("memory_items").select("*").eq("user_id", userId).order("created_at", { ascending: false })
  ]);

  // Opt-in por dominio (§4.2). Corte TEMPRANO, antes de cargar nada del
  // dominio: si el usuario no autorizó este ámbito, sus tablas ni se tocan.
  const enabledDomains = (profile?.ai_domains ?? []) as Domain[];
  const permitidos = allowedDomains(scope).filter((d) => enabledDomains.includes(d));
  if (!permitidos.length) {
    const apagados = allowedDomains(scope).map((d) => DOMAIN_LABEL[d]);
    return {
      ok: false,
      reason:
        apagados.length === 1
          ? `${apagados[0]} está apagado para el análisis. Enciéndelo en Configuración si quieres que sus cifras se envíen al modelo.`
          : `Ninguno de los dominios de este ámbito (${apagados.join(", ")}) está encendido. Actívalos en Configuración si quieres que sus cifras se envíen al modelo.`
    };
  }

  const overrides: FactsOverrides = { ...opts.overrides, modo };
  const facts = await loadFacts(
    supabase,
    userId,
    permitidos,
    today,
    {
      quincenalIncome: profile?.quincenal_income ?? 0,
      window: {
        start: (profile?.activity_window_start ?? "08:00").slice(0, 5),
        end: (profile?.activity_window_end ?? "18:00").slice(0, 5)
      }
    },
    overrides
  );

  facts.push(
    ...(await loadChainFacts(supabase, facts, permitidos, modo === "servicio" ? { modo: "servicio", userId } : { modo: "sesion" }))
  );

  const context = buildContext({
    scope,
    facts,
    previousRejections: (rejected ?? []).map((r) => ({ status: r.status, text: r.text })),
    enabledDomains,
    todayISO: today,
    memory: (memory ?? []).map(
      (m): MemoryItemLike => ({
        id: m.id,
        scope: m.scope as MemoryScope,
        origin: m.origin as MemoryItemLike["origin"],
        text: m.text,
        validUntil: m.valid_until
      })
    )
  });

  // Red de seguridad: `context.ts` es el único sitio donde el filtro de
  // privacidad manda (D-027); si decide dejar la lista vacía, aquí se para.
  if (!context.domains.length) {
    return { ok: false, reason: "Ningún dominio de este ámbito está autorizado para el análisis. Revísalo en Configuración." };
  }
  return { ok: true, context };
}

/**
 * Huella de lo que el modelo vería: ids y etiquetas de los hechos, ordenados.
 * Si la de esta noche es igual a la de la anterior, no hay nada nuevo que
 * analizar y la llamada al modelo sobra.
 */
export function huellaDeHechos(context: InsightContext): string {
  const texto = context.facts
    .map((f) => `${f.id}|${f.label}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(texto).digest("hex");
}

/**
 * El mismo análisis, decidido por el Kernel (D-175).
 *
 * Misma costura estrecha que `pensarPorElKernel` en `coach/daily.ts`: el
 * contexto ya está construido y lo que sigue —guardar, auditar, aplicar el
 * fingerprint— no cambia. Solo se sustituye quién decide que hay algo que
 * analizar y quién llama al modelo.
 *
 * `recommend` devuelve `{ ok: true }` con lista vacía cuando no hay nada
 * anómalo, y el Kernel puede devolver `ok: false` porque decidió callarse. Son
 * dos cosas distintas y por eso el motivo del silencio se anota aparte.
 */
async function analizarPorElKernel(input: {
  supabase: Db;
  userId: string;
  context: InsightContext;
  today: string | null;
}): Promise<RecommendResult> {
  const agente = obtenerAgente(INSIGHTS_METADATOS.id);
  if (!agente) {
    return { ok: false, recommendations: [], dropped: [], reason: "El Kernel no tiene registrado el análisis nocturno." };
  }

  const hoy = input.today ?? new Date().toISOString().slice(0, 10);
  const evento: AgentEvent = { tipo: "cron.noche", userId: input.userId, ocurridoEn: new Date().toISOString() };

  const [decisiones, desdeLaRevision] = await Promise.all([
    leerTodasLasDecisiones(input.supabase, input.userId),
    ultimaRevisionDeIdentidad(input.supabase, input.userId)
  ]);

  const veredicto = convieneActuar(agente, evento, {
    vecesEnLaFranja: 0,
    yaActuaron: [],
    descartadoHoy: false,
    rechazoSostenido: enRechazoSostenido(decisiones, agente.id, { desdeLaRevision })
  });
  if (!veredicto.actuar) {
    await anotarSilencio(input.supabase, { userId: input.userId, agenteId: agente.id, evento, motivo: veredicto.motivo });
    return { ok: false, recommendations: [], dropped: [], reason: veredicto.motivo };
  }

  const acotado = acotarContexto(
    agente,
    {
      userId: input.userId,
      today: hoy,
      timeZone: "UTC",
      domains: input.context.domains,
      facts: input.context.facts,
      memory: input.context.memory,
      rejections: input.context.rejections
    },
    evento
  );
  if (!acotado.ok) return { ok: false, recommendations: [], dropped: [], reason: acotado.reason };

  const salida = await ejecutarAgente(agente.id, acotado.entrada);
  if (!salida.ok) return { ok: false, recommendations: [], dropped: [], reason: salida.reason };
  if (!esSalidaInsights(salida.datos)) {
    return { ok: false, recommendations: [], dropped: [], reason: "El análisis del Kernel devolvió algo que no son recomendaciones." };
  }

  const { recomendaciones, descartadas, model } = salida.datos;
  return { ok: true, recommendations: recomendaciones, dropped: descartadas, ...(model ? { model } : {}) };
}

export async function recomendarYGuardar(opts: {
  supabase: Db;
  userId: string;
  scope: Scope;
  context: InsightContext;
  origen: "manual" | "nocturno";
  /** «Hoy» en la zona de la persona. Solo lo usa el camino del Kernel. */
  today?: string;
}): Promise<AnalyzeResult> {
  const { supabase, userId, scope, context, origen } = opts;

  // El Kernel solo manda de noche (D-175). Con `origen: "manual"` la persona
  // acaba de pulsar «Analizar» y está mirando: un restraint que decidiera
  // callarse sería un botón que no hace nada.
  const result =
    origen === "nocturno" && insightsPorElKernel()
      ? await analizarPorElKernel({ supabase, userId, context, today: opts.today ?? null })
      : await recommend(context);

  await supabase.from("audit_log").insert({
    user_id: userId,
    action: "ai.analyze",
    object: scope,
    meta: {
      scope,
      origen,
      domains: context.domains,
      factCount: context.facts.length,
      model: result.model ?? GEMINI_MODEL,
      created: result.recommendations.length,
      dropped: result.dropped.length
    }
  });

  if (!result.ok) return { ok: false, created: 0, reason: result.reason };
  if (!result.recommendations.length) {
    return { ok: true, created: 0, reason: result.reason ?? "El análisis no encontró nada que valga la pena reportar." };
  }

  // Deduplicación (§5.2). Una viva (Presented) con la misma huella se REFRESCA
  // con el texto nuevo; una silenciada (Suppressed) se SALTA: el usuario dijo
  // que no la quiere ver.
  const conHuella = result.recommendations.map((r) => ({ ...r, fingerprint: recommendationFingerprint(r.type, r.factIds) }));
  const { data: existentes } = await supabase
    .from("recommendations")
    .select("id, fingerprint, status")
    .eq("user_id", userId)
    .in("fingerprint", conHuella.map((r) => r.fingerprint))
    .in("status", ["Presented", "Suppressed"]);

  const porHuella = new Map((existentes ?? []).map((e) => [e.fingerprint, e]));
  const nuevas = conHuella.filter((r) => !porHuella.has(r.fingerprint));
  const refrescables = conHuella.filter((r) => porHuella.get(r.fingerprint)?.status === "Presented");

  for (const r of refrescables) {
    await supabase
      .from("recommendations")
      .update({ text: r.text, confidence: r.confidence, impact: r.impact, evidence: r.factIds, assumptions: r.assumptions })
      .eq("id", porHuella.get(r.fingerprint)!.id)
      .eq("user_id", userId);
  }

  const rows = nuevas.map((r) => ({
    user_id: userId,
    type: r.type,
    text: r.text,
    confidence: r.confidence,
    domain: scope,
    evidence: r.factIds,
    assumptions: r.assumptions,
    // Informativa: sin acciones aplicables (§8 del spec).
    actions: [],
    requires_confirmation: false,
    impact: r.impact,
    status: "Presented",
    fingerprint: r.fingerprint
  }));

  if (rows.length) {
    const { error } = await supabase.from("recommendations").insert(rows);
    if (error) return { ok: false, created: 0, reason: describeDbError(error) };
  }

  if (rows.length) return { ok: true, created: rows.length };
  return {
    ok: true,
    created: 0,
    reason:
      refrescables.length > 0
        ? "Nada nuevo: las recomendaciones que ya tenías se actualizaron con las cifras de hoy."
        : "Nada nuevo: el motor solo repitió lo que ya habías silenciado."
  };
}
