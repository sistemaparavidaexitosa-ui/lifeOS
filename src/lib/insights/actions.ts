"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { moneyFacts, type BudgetLineLike } from "@/lib/domain/insights/facts/money.ts";
import type { JournalEntryLike } from "@/lib/domain/types.ts";
import { buildAliasMap, buildContext, restore, type Scope } from "./context";
import { recommend } from "@/lib/ai/recommend";
import { MODEL } from "@/lib/ai/provider";
import { recommendationFingerprint } from "@/lib/domain/insights/fingerprint.ts";
import { canTransition, REJECTION_STATUSES, type RecommendationStatus } from "@/lib/domain/insights/states.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";
import type { MemoryItemLike, MemoryScope } from "@/lib/domain/insights/memory.ts";

/**
 * Intelligence OS — Fase 1: el análisis lo dispara el usuario, es informativo
 * y solo cubre el ámbito `money`.
 *
 * El orden importa y es el del spec (§3.5): cargar datos → extraer hechos →
 * filtrar contexto → modelo → validar anclaje → escribir. La carga vive aquí y
 * no en `context.ts` para que el filtro de privacidad se pueda probar sin base
 * de datos; `context.ts` sigue siendo el único sitio donde ese filtro se
 * aplica (ver D-027).
 */
export interface AnalyzeResult {
  ok: boolean;
  created: number;
  /** Mensaje para la UI: por qué no hubo recomendaciones, si no las hubo. */
  reason?: string;
}

/** Primer día del ciclo vigente: se usa el mes natural, como /money/budget. */
function cycleStart(todayISO: string): string {
  return `${todayISO.slice(0, 7)}-01`;
}

export async function analyze(scope: Scope): Promise<AnalyzeResult> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, created: 0, reason: "No autenticado" };

  if (scope !== "money") {
    return { ok: false, created: 0, reason: "Por ahora el análisis solo cubre Dinero. Los demás ámbitos llegan en la siguiente fase." };
  }

  const today = todayLocal(await getUserTimeZone());

  const [{ data: profile }, { data: budgets }, { data: entries }, { data: accounts }, { data: members }, { data: rejected }, { data: memory }] =
    await Promise.all([
      supabase.from("profiles").select("quincenal_income, ai_domains").eq("user_id", user.id).single(),
      supabase.from("budgets").select("*").eq("period", "current"),
      supabase.from("journal_entries").select("*, journal_lines(*)"),
      supabase.from("accounts").select("name").order("created_at"),
      supabase.from("family_members").select("name").order("created_at"),
      supabase
        .from("recommendations")
        .select("status, text")
        .in("status", REJECTION_STATUSES)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("memory_items").select("*").order("created_at", { ascending: false })
    ]);

  // Opt-in por dominio (§4.2). Vacío por defecto: nada sale hacia el modelo
  // hasta que el usuario lo encienda en Configuración.
  const enabledDomains = (profile?.ai_domains ?? []) as Domain[];

  const entriesForDomain: JournalEntryLike[] = (entries ?? []).map((e) => ({
    id: e.id,
    type: e.type as JournalEntryLike["type"],
    date: e.entry_date,
    category: e.category,
    status: e.status as JournalEntryLike["status"],
    lines: (e.journal_lines ?? []).map((l) => ({ account: l.account_id, amount: l.amount }))
  }));

  const budgetLines: BudgetLineLike[] = (budgets ?? []).map((b) => ({
    id: b.id,
    category: b.category,
    monthlyCost: b.monthly_cost,
    q1Amount: b.q1_amount,
    q2Amount: b.q2_amount
  }));

  const facts = moneyFacts(
    {
      budgets: budgetLines,
      entries: entriesForDomain,
      quincenalIncome: profile?.quincenal_income ?? 0,
      cycleFromISO: cycleStart(today)
    },
    today
  );

  // Los nombres reales no salen del servidor (§4.2). El mapa se queda aquí y
  // se usa para devolverlos al escribir la recomendación.
  const aliases = buildAliasMap([
    ...(accounts ?? []).map((a) => ({ kind: "account" as const, name: a.name })),
    ...(members ?? []).map((m) => ({ kind: "member" as const, name: m.name }))
  ]);

  const context = buildContext({
    scope,
    facts,
    previousRejections: (rejected ?? []).map((r) => ({ status: r.status, text: r.text })),
    aliases,
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

  // Si el usuario no autorizó este dominio, se dice explícitamente en vez de
  // fingir cobertura y devolver una lista vacía sin explicación (§4.2).
  if (!context.domains.length) {
    return {
      ok: false,
      created: 0,
      reason: `Dinero está apagado para el análisis. Enciéndelo en Configuración si quieres que sus cifras se envíen al modelo.`
    };
  }

  const result = await recommend(context);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "ai.analyze",
    object: scope,
    meta: {
      scope,
      domains: context.domains,
      factCount: context.facts.length,
      model: MODEL,
      created: result.recommendations.length,
      dropped: result.dropped.length
    }
  });

  if (!result.ok) return { ok: false, created: 0, reason: result.reason };
  if (!result.recommendations.length) {
    return { ok: true, created: 0, reason: result.reason ?? "El análisis no encontró nada que valga la pena reportar." };
  }

  // Deduplicación (§5.2). Se consulta primero en vez de hacer upsert porque el
  // índice único es parcial y porque las dos ramas no hacen lo mismo:
  //  - una viva (Presented) con la misma huella se REFRESCA con el texto nuevo;
  //  - una silenciada (Suppressed) se SALTA. El usuario dijo que no la quiere
  //    ver; volver a insertarla con otro texto sería burlar esa decisión.
  const conHuella = result.recommendations.map((r) => ({ ...r, fingerprint: recommendationFingerprint(r.type, r.factIds) }));
  const { data: existentes } = await supabase
    .from("recommendations")
    .select("id, fingerprint, status")
    .in("fingerprint", conHuella.map((r) => r.fingerprint))
    .in("status", ["Presented", "Suppressed"]);

  const porHuella = new Map((existentes ?? []).map((e) => [e.fingerprint, e]));
  const nuevas = conHuella.filter((r) => !porHuella.has(r.fingerprint));
  const refrescables = conHuella.filter((r) => porHuella.get(r.fingerprint)?.status === "Presented");

  for (const r of refrescables) {
    await supabase
      .from("recommendations")
      .update({
        text: restore(r.text, aliases),
        confidence: r.confidence,
        impact: r.impact,
        evidence: r.factIds,
        assumptions: r.assumptions.map((a) => restore(a, aliases))
      })
      .eq("id", porHuella.get(r.fingerprint)!.id);
  }

  const rows = nuevas.map((r) => ({
    user_id: user.id,
    type: r.type,
    // Se devuelven los nombres reales: el alias fue solo para el viaje de ida.
    text: restore(r.text, aliases),
    confidence: r.confidence,
    domain: scope,
    evidence: r.factIds,
    assumptions: r.assumptions.map((a) => restore(a, aliases)),
    // Fase 1 es informativa: sin acciones aplicables todavía (§8 del spec).
    actions: [],
    requires_confirmation: false,
    impact: r.impact,
    status: "Presented",
    fingerprint: r.fingerprint
  }));

  if (rows.length) {
    const { error } = await supabase.from("recommendations").insert(rows);
    if (error) return { ok: false, created: 0, reason: error.message };
  }

  revalidatePath("/money");
  revalidatePath("/intelligence");
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

/**
 * Mueve una recomendación por la máquina de estados (§5.1). La transición se
 * valida contra el estado REAL en la base, no contra el que traiga el cliente:
 * la bandeja puede estar desactualizada en otra pestaña.
 */
export async function setRecommendationStatus(id: string, to: RecommendationStatus): Promise<{ ok: boolean; reason?: string }> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const { data: current } = await supabase.from("recommendations").select("status").eq("id", id).single();
  if (!current) return { ok: false, reason: "La recomendación ya no existe." };

  const from = current.status as RecommendationStatus;
  if (!canTransition(from, to)) return { ok: false, reason: `No se puede pasar de ${from} a ${to}.` };

  const { error } = await supabase.from("recommendations").update({ status: to }).eq("id", id);
  if (error) return { ok: false, reason: error.message };

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "ai.recommendation.status",
    object: id,
    meta: { from, to }
  });

  revalidatePath("/money");
  revalidatePath("/intelligence");
  return { ok: true };
}

/**
 * El usuario ajusta el texto antes de darlo por bueno. Pasa a `Edited`, que es
 * un estado vivo: sigue esperando decisión, pero ya no es lo que el modelo
 * escribió y la bandeja lo distingue.
 */
export async function editRecommendationText(id: string, text: string): Promise<{ ok: boolean; reason?: string }> {
  const limpio = text.trim();
  if (!limpio) return { ok: false, reason: "El texto no puede quedar vacío." };

  const supabase = await createClient();
  const { data: current } = await supabase.from("recommendations").select("status").eq("id", id).single();
  if (!current) return { ok: false, reason: "La recomendación ya no existe." };
  if (!canTransition(current.status as RecommendationStatus, "Edited") && current.status !== "Edited") {
    return { ok: false, reason: "Esta recomendación ya no se puede editar." };
  }

  const { error } = await supabase.from("recommendations").update({ text: limpio, status: "Edited" }).eq("id", id);
  if (error) return { ok: false, reason: error.message };

  revalidatePath("/money");
  revalidatePath("/intelligence");
  return { ok: true };
}

// --- Memoria (§6) -----------------------------------------------------------

const MEMORY_SCOPES = ["goal", "project", "finance", "decision", "preference", "time", "habit"] as const;

/**
 * Alta y edición de una nota de memoria. Solo origen `user`: la memoria de
 * origen `ai` nace únicamente de aceptar una recomendación con acción
 * `memory.remember`, y esas acciones llegan en la Fase 4. Nunca se escribe sola.
 */
export async function upsertMemoryItem(id: string | null, formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const text = String(formData.get("text") ?? "").trim();
  const scope = String(formData.get("scope") ?? "");
  const validUntilRaw = String(formData.get("validUntil") ?? "").trim();

  if (!text) return { ok: false, reason: "Escribe la nota." };
  if (!(MEMORY_SCOPES as readonly string[]).includes(scope)) return { ok: false, reason: "Ámbito inválido." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const payload = { scope, text, valid_until: validUntilRaw || null };
  const { error } = id
    ? await supabase.from("memory_items").update(payload).eq("id", id)
    : await supabase.from("memory_items").insert({ ...payload, user_id: user.id, origin: "user" });
  if (error) return { ok: false, reason: error.message };

  revalidatePath("/intelligence/memory");
  return { ok: true };
}

export async function deleteMemoryItem(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("memory_items").delete().eq("id", id);
  revalidatePath("/intelligence/memory");
}

// --- Configuración del motor (§4.2, §4.4) -----------------------------------

/**
 * Qué dominios autoriza el usuario a enviar al modelo. Se reemplaza la lista
 * completa en cada guardado: es una casilla por dominio, no un incremental.
 */
export async function setAiDomains(formData: FormData): Promise<void> {
  const domains = ["money", "debt", "habits", "time", "execution"].filter((d) => formData.get(`domain.${d}`) === "on");

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profiles").update({ ai_domains: domains }).eq("user_id", user.id);
  await supabase.from("audit_log").insert({ user_id: user.id, action: "ai.optin", object: "", meta: { domains } });

  revalidatePath("/settings");
  revalidatePath("/money");
}

/** §4.4: borrar TODO el historial de recomendaciones. Sin vuelta atrás. */
export async function clearAiHistory(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("recommendations").delete().eq("user_id", user.id);
  await supabase.from("audit_log").insert({ user_id: user.id, action: "ai.clear.history", object: "" });
  revalidatePath("/intelligence");
  revalidatePath("/money");
  revalidatePath("/settings");
}

/** §4.4: borrar toda la memoria. */
export async function clearMemory(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("memory_items").delete().eq("user_id", user.id);
  await supabase.from("audit_log").insert({ user_id: user.id, action: "ai.clear.memory", object: "" });
  revalidatePath("/intelligence/memory");
  revalidatePath("/settings");
}
