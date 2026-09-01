import "server-only";
import { createClient } from "@/lib/supabase/server";
import { accountBalance, periodStats } from "@/lib/domain/money.ts";
import { saturationStatus, occupationAppliesOn } from "@/lib/domain/time.ts";
import { effectiveStatus } from "@/lib/domain/task-state.ts";
import { budgetTabRow } from "@/lib/domain/budget.ts";
import { loadMyTasks } from "./tasks";
import { dueReminders, type ReminderLike } from "@/lib/domain/execution/reminders.ts";
import { todayLocal, addDaysISO } from "./dates";
import { getUserTimeZone } from "./profile";
import { loadReadingFocus } from "./development";

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
 *
 * FIX (acceso por espacio de trabajo, migración 0031): las tareas ya no se
 * piden por dueño del proyecto — con los espacios compartidos, "tuyo" dejó de
 * ser sinónimo de "de un proyecto que creaste". Quién decide eso ahora es
 * `loadMyTasks` (data/tasks.ts), que el motor de recomendaciones también usa
 * para no inventarse una segunda definición.
 */
export async function getHomeData(userId: string) {
  const supabase = await createClient();
  // "Hoy" en la zona del perfil, no la del servidor: el plan diario se busca
  // por local_date y con UTC se pedía el del día siguiente cada tarde.
  const t0 = todayLocal(await getUserTimeZone());
  const from15 = addDaysISO(t0, -15);

  const [
    { data: profile },
    { data: dailyPlan },
    allTasks,
    { data: accounts },
    { data: journalEntries },
    { data: budgets },
    { data: occupations },
    { data: reminderRows },
    readingFocus
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("daily_plans").select("*").eq("user_id", userId).eq("local_date", t0).maybeSingle(),
    loadMyTasks(userId),
    supabase.from("accounts").select("*").eq("user_id", userId),
    supabase.from("journal_entries").select("*, journal_lines(*)").eq("user_id", userId).gte("entry_date", from15),
    supabase.from("budgets").select("*").eq("user_id", userId).eq("period", "current"),
    supabase.from("occupations").select("*").eq("user_id", userId),
    // Pendientes y ya vencidos. El corte por fecha se hace en el dominio: aquí
    // solo se descartan los hechos, que no vuelven nunca.
    supabase.from("reminders").select("*").eq("user_id", userId).eq("done", false).order("remind_on"),
    // Ya no se elige el libro aquí con `updated_at` más reciente: eso señalaba
    // el que tocaste al final, no el que decidiste leer, y el Panel de
    // Desarrollo podía acabar enseñando otro distinto en la misma sesión.
    // loadReadingFocus() (data/development.ts) es la ÚNICA fuente: aplica la
    // cola semanal de la migración 0042 y cae a esta misma heurística solo
    // cuando no hay ningún plan.
    loadReadingFocus()
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

  const impactTasks = allTasks.filter((t) => t.impact && t.status !== "Completed" && t.status !== "Cancelled").slice(0, 3);
  const overdueCount = allTasks.filter((t) => effectiveStatus({ status: t.status, due: t.due }, t0) === "Overdue").length;
  const openCount = allTasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled").length;

  const impactMinutes = allTasks
    .filter((t) => t.impact && t.status !== "Completed" && t.status !== "Cancelled")
    .reduce((s, t) => s + (t.est ?? 0), 0);

  // Solo las ocupaciones que aplican HOY cuentan para "Tu tiempo hoy": las
  // recurrentes que incluyen este día de la semana, y las que tienen occ_date
  // de hoy. El predicado vive en el dominio (occupationAppliesOn) porque antes
  // estaba copiado aquí, en /time y en WeekView.
  const todayOccupations = (occupations ?? [])
    .filter((o) => occupationAppliesOn({ recurring: o.recurring, occDate: o.occ_date, days: o.days }, t0))
    .map((o) => ({ id: o.id, title: o.title, start: o.start_time.slice(0, 5), end: o.end_time.slice(0, 5) }));

  // Los VENCIDOS también entran: un recordatorio que se quedó atrás porque no
  // abriste la app el martes no puede desaparecer en silencio — es justo lo que
  // un recordatorio promete no hacer.
  const reminders = dueReminders(
    (reminderRows ?? []).map(
      (r): ReminderLike => ({
        id: r.id,
        subjectType: r.subject_type as "task" | "comment",
        subjectId: r.subject_id,
        text: r.text,
        remindOnISO: r.remind_on,
        done: r.done
      })
    ),
    t0
  );

  // El título de la tarea a la que apuntan, para que el recordatorio diga de
  // qué va. Los que apuntan a un comentario se resuelven por su tarea.
  const reminderTaskIds = reminders.filter((r) => r.subjectType === "task").map((r) => r.subjectId);
  const titleById = new Map(allTasks.filter((t) => reminderTaskIds.includes(t.id)).map((t) => [t.id, t.title]));

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
    reminders: reminders.map((r) => ({ ...r, subjectTitle: titleById.get(r.subjectId) ?? null })),
    todayISO: t0,
    readingFocus
  };
}
