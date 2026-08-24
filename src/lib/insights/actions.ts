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

  const [{ data: profile }, { data: budgets }, { data: entries }, { data: accounts }, { data: members }, { data: rejected }] =
    await Promise.all([
      supabase.from("profiles").select("quincenal_income").eq("user_id", user.id).single(),
      supabase.from("budgets").select("*").eq("period", "current"),
      supabase.from("journal_entries").select("*, journal_lines(*)"),
      supabase.from("accounts").select("name").order("created_at"),
      supabase.from("family_members").select("name").order("created_at"),
      supabase
        .from("recommendations")
        .select("status, text")
        .in("status", ["Suppressed", "Reported"])
        .order("created_at", { ascending: false })
        .limit(20)
    ]);

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
    aliases
  });

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

  const rows = result.recommendations.map((r) => ({
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
    status: "Presented"
  }));

  const { error } = await supabase.from("recommendations").insert(rows);
  if (error) return { ok: false, created: 0, reason: error.message };

  revalidatePath("/money");
  return { ok: true, created: rows.length };
}

/** Descartar esta vez. Vuelve a poder aparecer en un análisis futuro. */
export async function dismissRecommendation(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("recommendations").update({ status: "Dismissed" }).eq("id", id);
  revalidatePath("/money");
}

/** No volver a mostrarla: entra como contexto de rechazo del próximo análisis. */
export async function suppressRecommendation(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("recommendations").update({ status: "Suppressed" }).eq("id", id);
  revalidatePath("/money");
}
