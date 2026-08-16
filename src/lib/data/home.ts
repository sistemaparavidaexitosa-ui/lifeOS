import "server-only";
import { createClient } from "@/lib/supabase/server";
import { accountBalance, periodStats } from "@/lib/domain/money.ts";
import { saturationStatus } from "@/lib/domain/time.ts";
import { effectiveStatus } from "@/lib/domain/task-state.ts";
import { budgetTabRow } from "@/lib/domain/budget.ts";
import { todayLocal, addDaysISO } from "./dates";
import type { TaskStatus } from "@/lib/domain/types.ts";

/**
 * Agrega TODA la información real de Home en una sola pasada — todo viene de
 * Supabase (RLS filtra por auth.uid()), NADA está hardcodeado (guardrail
 * NO-MOCK, F8): si desconectas la BD, esta función lanza y la página muestra
 * un error, nunca datos de relleno.
 *
 * FIX (soporte de ocupaciones por día específico, migración
 * 0016_time_occupation_date.sql): antes se pasaban TODAS las ocupaciones del
 * usuario a saturationStatus, sin filtrar por fecha — con occ_date ahora
 * existiendo, una ocupación no-recurrente puede pertenecer a CUALQUIER día
 * (no solo hoy), así que hay que filtrar aquí exactamente igual que en
 * src/app/(app)/time/page.tsx: solo cuentan las recurrentes o las que
 * tengan occ_date = hoy. Sin este filtro, el widget "Tu tiempo hoy" de Home
 * mostraría ocupaciones de OTROS días como si fueran de hoy.
 */
export async function getHomeData(userId: string) {
  const supabase = await createClient();
  const t0 = todayLocal();
  const from15 = addDaysISO(t0, -15);

  const [
    { data: profile },
    { data: dailyPlan },
    { data: tasks },
    { data: accounts },
    { data: journalEntries },
    { data: budgets },
    { data: occupations },
    { data: currentBook }
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("daily_plans").select("*").eq("user_id", userId).eq("local_date", t0).maybeSingle(),
    supabase.from("tasks").select("*, projects!inner(owner_id)").eq("projects.owner_id", userId),
    supabase.from("accounts").select("*").eq("user_id", userId),
    supabase.from("journal_entries").select("*, journal_lines(*)").eq("user_id", userId).gte("entry_date", from15),
    supabase.from("budgets").select("*").eq("user_id", userId).eq("period", "current"),
    supabase.from("occupations").select("*").eq("user_id", userId),
    supabase
      .from("books")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "Leyendo")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (!profile) throw new Error("No se encontró el perfil del usuario (revisa RLS/seed).");

  const entries = (journalEntries ?? []).map((e) => ({
    id: e.id,
    type: e.type as "income" | "expense" | "transfer",
    date: e.entry_date,
    category: e.category,
    status: e.status as "Posted" | "Reconciled" | "Reversed",
    lines: (e.journal_lines ?? []).map((l) => ({ account: l.account_id, amount: l.amount }))
  }));

  const liquidity = (accounts ?? []).reduce((sum, a) => sum + accountBalance(a.id, a.opening_balance, entries), 0);
  const stats = periodStats(entries, from15);

  const budgetRows = (budgets ?? []).map((b) =>
    budgetTabRow(
      { id: b.id, category: b.category, monthlyCost: b.monthly_cost, q1Amount: b.q1_amount, q2Amount: b.q2_amount },
      entries,
      from15
    )
  );
  const budgetRemaining = budgetRows.reduce((sum, r) => sum + Math.max(0, r.balance), 0);

  const allTasks = tasks ?? [];
  const impactTasks = allTasks.filter((t) => t.impact && t.status !== "Completed" && t.status !== "Cancelled").slice(0, 3);
  const overdueCount = allTasks.filter((t) => effectiveStatus({ status: t.status as TaskStatus, due: t.due }, t0) === "Overdue").length;
  const openCount = allTasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled").length;

  const impactMinutes = allTasks
    .filter((t) => t.impact && t.status !== "Completed" && t.status !== "Cancelled")
    .reduce((s, t) => s + (t.est ?? 0), 0);

  // FIX: solo ocupaciones recurrentes o con occ_date = hoy cuentan para "Tu
  // tiempo hoy" — ver comentario de la función arriba.
  const todayOccupations = (occupations ?? [])
    .filter((o) => o.recurring || o.occ_date === t0)
    .map((o) => ({ id: o.id, title: o.title, start: o.start_time.slice(0, 5), end: o.end_time.slice(0, 5) }));

  const saturation = saturationStatus(
    { start: profile.activity_window_start.slice(0, 5), end: profile.activity_window_end.slice(0, 5) },
    todayOccupations,
    impactMinutes
  );

  return {
    profile,
    dailyPlan,
    impactTasks,
    overdueCount,
    openCount,
    liquidity,
    periodStats: stats,
    budgetRemaining,
    saturation,
    currentBook
  };
}
