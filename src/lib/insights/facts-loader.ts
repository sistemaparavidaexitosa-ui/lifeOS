// src/lib/insights/facts-loader.ts
// LA CARGA DE DATOS DEL MOTOR DE HECHOS.
//
// POR QUÉ ESTÁ EN SU PROPIO ARCHIVO
// Vivía dentro de `actions.ts`, que lleva `"use server"` en la primera línea:
// ahí todo lo exportado tiene que ser una Server Action, así que `loadFacts`
// solo podía ser privada y nadie más podía usarla. Al abrir el chat de IA
// —que necesita exactamente los mismos hechos y exactamente el mismo filtro de
// privacidad— la alternativa era una SEGUNDA forma de cargarlos, condenada a
// divergir de la primera al siguiente cambio. Se sacó tal cual, sin tocar la
// lógica.
//
// El orden del spec (§3.5) no cambia: cargar datos → extraer hechos → filtrar
// contexto → modelo. Esto es el primer paso; el filtro sigue siendo `context.ts`
// y sigue siendo el único sitio donde se aplica (D-027).
//
// Nótese lo que NO hay aquí: aritmética. Cada bloque carga filas, las traduce a
// la forma que pide su extractor y delega. Toda la decisión de qué es anómalo
// vive en domain/insights/facts/**, que se prueba sin base de datos.

import type { createClient } from "@/lib/supabase/server";
import { getPersonalWorkspaceIds } from "@/lib/data/workspaces";
import { moneyFacts, type BudgetLineLike } from "@/lib/domain/insights/facts/money.ts";
import { timeFacts } from "@/lib/domain/insights/facts/time.ts";
import { executionFacts } from "@/lib/domain/insights/facts/execution.ts";
import { habitsFacts, type HabitFrequency } from "@/lib/domain/insights/facts/habits.ts";
import { debtFacts } from "@/lib/domain/insights/facts/debt.ts";
import { activityFacts, type UnreadMentionLike } from "@/lib/domain/insights/facts/activity.ts";
import { occupationAppliesOn } from "@/lib/domain/time.ts";
import { addDaysISO } from "@/lib/domain/datetime.ts";
import { loadMyTasks, type MyTaskRow } from "@/lib/data/tasks";
import type { JournalEntryLike, ProjectStatus } from "@/lib/domain/types.ts";
import type { Domain, Fact } from "@/lib/domain/insights/types.ts";

/** Primer día del ciclo vigente: se usa el mes natural, como /money/budget. */
function cycleStart(todayISO: string): string {
  return `${todayISO.slice(0, 7)}-01`;
}

/** Lo que los extractores necesitan del perfil y no sale de sus propias tablas. */
export interface ProfileBits {
  quincenalIncome: number;
  window: { start: string; end: string };
}

export type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Carga los datos de cada dominio permitido y devuelve sus hechos.
 *
 * Un dominio, una función, y todas en paralelo: el ámbito `execution` incluye
 * también `time` (allowedDomains), y encadenarlas duplicaría la espera del
 * análisis sin ganar nada.
 *
 * Nótese lo que NO hay aquí: aritmética. Cada bloque carga filas, las traduce a
 * la forma que pide su extractor y delega. Toda la decisión de qué es anómalo
 * vive en domain/insights/facts/**, que se prueba sin base de datos.
 */
export async function loadFacts(supabase: Db, userId: string, domains: Domain[], today: string, profile: ProfileBits): Promise<Fact[]> {
  const partes = await Promise.all(domains.map((domain) => loadDomainFacts(supabase, userId, domain, today, profile)));
  return partes.flat();
}

async function loadDomainFacts(supabase: Db, userId: string, domain: Domain, today: string, profile: ProfileBits): Promise<Fact[]> {
  switch (domain) {
    case "money": {
      const [{ data: budgets }, { data: entries }] = await Promise.all([
        supabase.from("budgets").select("*").eq("period", "current"),
        supabase.from("journal_entries").select("*, journal_lines(*)")
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

      return moneyFacts(
        { budgets: budgetLines, entries: entriesForDomain, quincenalIncome: profile.quincenalIncome, cycleFromISO: cycleStart(today) },
        today
      );
    }

    case "time": {
      const [{ data: occupations }, tasks] = await Promise.all([
        supabase.from("occupations").select("*").eq("user_id", userId),
        loadMyTasks(userId)
      ]);

      // Mismo filtro por día que /time y que Home: una ocupación no recurrente
      // pertenece a SU fecha y a ninguna otra (migración 0016).
      const hoy = (occupations ?? [])
        .filter((o) => occupationAppliesOn({ recurring: o.recurring, occDate: o.occ_date, days: o.days }, today))
        .map((o) => ({ id: o.id, title: o.title, start: o.start_time.slice(0, 5), end: o.end_time.slice(0, 5) }));

      return timeFacts({
        window: profile.window,
        todayOccupations: hoy,
        impactTasks: tasks.filter(isOpenTask).filter((t) => t.impact).map((t) => ({ id: t.id, title: t.title, est: t.est }))
      });
    }

    case "execution": {
      const [tasks, { data: projects }] = await Promise.all([
        loadMyTasks(userId),
        supabase.from("projects").select("id, title, status")
      ]);

      // Solo los proyectos donde tengo trabajo. Ser miembro de un espacio da
      // acceso a proyectos enteros que no llevo yo, y decirle a alguien que el
      // proyecto de un compañero lleva tres semanas parado no es una
      // recomendación, es un chisme.
      const mios = new Set(tasks.map((t) => t.projectId));

      return executionFacts(
        {
          projects: (projects ?? [])
            .filter((p) => mios.has(p.id))
            .map((p) => ({ id: p.id, title: p.title, status: p.status as ProjectStatus })),
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            projectId: t.projectId,
            status: t.status,
            due: t.due,
            deps: t.deps,
            completedAtISO: t.completedAtISO
          }))
        },
        today
      );
    }

    case "habits": {
      // Los registros se piden por ventana: `max_rows = 1000` en config.toml
      // trunca en silencio y sin orden fijo, así que a partir de unos meses el
      // motor vería un histórico con agujeros y afirmaría rachas que no son.
      // 40 días cubren con holgura la ventana de observación de habitsFacts
      // —30 días— y la racha previa que compara para detectar la que se rompió.
      const desdeLogs = addDaysISO(today, -39);

      // Desde 0046 el hábito NO tiene frecuencia ni bloque horario propios: los
      // pone la rutina de la que cuelga, que es el único sitio donde se dicen.
      const [{ data: habits }, { data: logs }, { data: routines }, { data: runs }] = await Promise.all([
        supabase.from("habits").select("id, name, routine_id, routines(frequency)").eq("user_id", userId),
        supabase.from("habit_logs").select("habit_id, log_date").gte("log_date", desdeLogs).lte("log_date", today),
        supabase.from("routines").select("id, name, occupation_id, habits(id)").eq("user_id", userId),
        supabase.from("routine_runs").select("routine_id, local_date")
      ]);

      return habitsFacts(
        {
          habits: (habits ?? []).map((h) => ({
            id: h.id,
            name: h.name,
            routineId: h.routine_id,
            routineFrequency: (h.routines?.frequency ?? "Diario") as HabitFrequency
          })),
          logs: (logs ?? []).map((l) => ({ habitId: l.habit_id, date: l.log_date })),
          routines: (routines ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            habitCount: (r.habits ?? []).length,
            occupationId: r.occupation_id
          })),
          routineRuns: (runs ?? []).map((r) => ({ routineId: r.routine_id, date: r.local_date }))
        },
        today
      );
    }

    case "activity": {
      // La actividad cuelga del ESPACIO, no del usuario, así que hace falta
      // saber cuál. Se usa el personal —el que siempre existe desde 0030— por
      // el mismo motivo que la paleta: el ámbito del análisis no viaja en la
      // llamada, y adivinarlo sería peor que fijar el que todos tienen.
      const personalIds = await getPersonalWorkspaceIds();
      const workspaceId = personalIds[0];
      if (!workspaceId) return [];

      const [{ data: rows }, { data: projects }, { data: mentions }, { data: reads }] = await Promise.all([
        supabase
          .from("workspace_activity")
          .select("id, type, project_id, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("projects").select("id, title").eq("workspace_id", workspaceId),
        supabase
          .from("comments")
          .select("id, subject_id, created_at")
          .eq("subject_type", "task")
          .contains("mentioned_user_ids", [userId])
          .neq("author_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("comment_reads").select("comment_id").eq("user_id", userId)
      ]);

      const mencionadas = mentions ?? [];
      if (!mencionadas.length && !(rows ?? []).length) return [];

      // ¿Alguien escribió DESPUÉS en el mismo hilo? Una sola consulta para
      // todas las tareas implicadas, no una por mención.
      const taskIds = [...new Set(mencionadas.map((m) => m.subject_id))];
      const [{ data: tasks }, { data: posteriores }] = await Promise.all([
        taskIds.length
          ? supabase.from("tasks").select("id, title").in("id", taskIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[] }),
        taskIds.length
          ? supabase.from("comments").select("subject_id, created_at").eq("subject_type", "task").in("subject_id", taskIds)
          : Promise.resolve({ data: [] as { subject_id: string; created_at: string }[] })
      ]);

      const tituloPorTarea = new Map((tasks ?? []).map((t) => [t.id, t.title]));
      const leidos = new Set((reads ?? []).map((r) => r.comment_id));

      const sinLeer: UnreadMentionLike[] = mencionadas.flatMap((m) => {
        if (leidos.has(m.id)) return [];
        const titulo = tituloPorTarea.get(m.subject_id);
        // Una mención cuya tarea ya no existe no lleva a ninguna parte.
        if (!titulo) return [];
        return [
          {
            commentId: m.id,
            taskId: m.subject_id,
            taskTitle: titulo,
            at: m.created_at,
            answered: (posteriores ?? []).some((c) => c.subject_id === m.subject_id && c.created_at > m.created_at)
          }
        ];
      });

      return activityFacts(
        {
          rows: (rows ?? []).map((r) => ({ id: r.id, type: r.type, projectId: r.project_id, at: r.created_at })),
          mentions: sinLeer,
          projects: (projects ?? []).map((p) => ({ id: p.id, title: p.title }))
        },
        today
      );
    }

    case "debt": {
      const [{ data: debts }, { data: pagos }] = await Promise.all([
        supabase.from("debts").select("id, name, balance, rate, min_payment").eq("user_id", userId),
        // Solo los gastos YA ligados a una deuda. Un gasto sin `debt_id` no es
        // un pago de deuda: es un gasto (ver money/actions.ts, que además baja
        // el saldo al registrarlo).
        supabase.from("journal_entries").select("debt_id, entry_date").not("debt_id", "is", null)
      ]);

      return debtFacts(
        {
          debts: (debts ?? []).map((d) => ({
            id: d.id,
            name: d.name,
            balance: Number(d.balance),
            rate: Number(d.rate),
            minPayment: Number(d.min_payment)
          })),
          payments: (pagos ?? [])
            .filter((p): p is typeof p & { debt_id: string } => Boolean(p.debt_id))
            .map((p) => ({ debtId: p.debt_id, date: p.entry_date }))
        },
        today
      );
    }
  }
}

function isOpenTask(task: MyTaskRow): boolean {
  return task.status !== "Completed" && task.status !== "Cancelled";
}

