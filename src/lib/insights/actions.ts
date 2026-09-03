"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { getPersonalWorkspaceIds } from "@/lib/data/workspaces";
import { moneyFacts, type BudgetLineLike } from "@/lib/domain/insights/facts/money.ts";
import { timeFacts } from "@/lib/domain/insights/facts/time.ts";
import { executionFacts } from "@/lib/domain/insights/facts/execution.ts";
import { habitsFacts, type HabitFrequency } from "@/lib/domain/insights/facts/habits.ts";
import { debtFacts } from "@/lib/domain/insights/facts/debt.ts";
import { activityFacts, type UnreadMentionLike } from "@/lib/domain/insights/facts/activity.ts";
import { occupationAppliesOn } from "@/lib/domain/time.ts";
import { loadMyTasks, type MyTaskRow } from "@/lib/data/tasks";
import type { JournalEntryLike, ProjectStatus } from "@/lib/domain/types.ts";
import { allowedDomains, buildAliasMap, buildContext, restore, type Scope } from "./context";
import { recommend } from "@/lib/ai/recommend";
import { GEMINI_MODEL } from "@/lib/ai/gemini-provider";
import { recommendationFingerprint } from "@/lib/domain/insights/fingerprint.ts";
import { canTransition, REJECTION_STATUSES, type RecommendationStatus } from "@/lib/domain/insights/states.ts";
import { DOMAIN_LABEL, type Domain, type Fact } from "@/lib/domain/insights/types.ts";
import type { MemoryItemLike, MemoryScope } from "@/lib/domain/insights/memory.ts";

/**
 * Intelligence OS — el análisis lo dispara el usuario y es informativo.
 *
 * El orden importa y es el del spec (§3.5): cargar datos → extraer hechos →
 * filtrar contexto → modelo → validar anclaje → escribir. La carga vive aquí y
 * no en `context.ts` para que el filtro de privacidad se pueda probar sin base
 * de datos; `context.ts` sigue siendo el único sitio donde ese filtro se
 * aplica (ver D-027).
 *
 * Cubre los cinco dominios personales —`money`, `debt`, `time`, `execution` y
 * `habits`— y con ellos el ámbito `global`, que es el único que los cruza.
 *
 * `activity` va aparte y NO entra en `global`: habla del equipo, no del usuario
 * (ver allowedDomains en context.ts).
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

/**
 * Dónde vive el panel de cada ámbito, para revalidar la ruta que de verdad hay
 * que repintar. No es "dónde están los datos" sino "dónde está el botón": el
 * de `habits` se embebe en el panel de Desarrollo Personal, no en la pantalla
 * de hábitos (ver InsightSection en development/page.tsx).
 */
const SCOPE_PATH: Record<Scope, string> = {
  money: "/money",
  debt: "/debt",
  habits: "/development",
  time: "/time",
  execution: "/execution",
  activity: "/activity",
  global: "/home"
};

/** Lo que los extractores necesitan del perfil y no sale de sus propias tablas. */
interface ProfileBits {
  quincenalIncome: number;
  window: { start: string; end: string };
}

type Db = Awaited<ReturnType<typeof createClient>>;

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
async function loadFacts(supabase: Db, userId: string, domains: Domain[], today: string, profile: ProfileBits): Promise<Fact[]> {
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
      const [{ data: habits }, { data: logs }, { data: routines }, { data: runs }] = await Promise.all([
        supabase.from("habits").select("id, name, frequency, occupation_id").eq("user_id", userId),
        supabase.from("habit_logs").select("habit_id, log_date"),
        supabase.from("routines").select("id, name, routine_steps(id)").eq("user_id", userId),
        supabase.from("routine_runs").select("routine_id, local_date")
      ]);

      return habitsFacts(
        {
          habits: (habits ?? []).map((h) => ({
            id: h.id,
            name: h.name,
            frequency: h.frequency as HabitFrequency,
            occupationId: h.occupation_id
          })),
          logs: (logs ?? []).map((l) => ({ habitId: l.habit_id, date: l.log_date })),
          routines: (routines ?? []).map((r) => ({ id: r.id, name: r.name, stepCount: (r.routine_steps ?? []).length })),
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

export async function analyze(scope: Scope): Promise<AnalyzeResult> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, created: 0, reason: "No autenticado" };

  const today = todayLocal(await getUserTimeZone());

  const [{ data: profile }, { data: accounts }, { data: members }, { data: rejected }, { data: memory }] = await Promise.all([
    supabase
      .from("profiles")
      .select("quincenal_income, ai_domains, activity_window_start, activity_window_end")
      .eq("user_id", user.id)
      .single(),
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

  // Corte TEMPRANO, antes de cargar nada del dominio. `buildContext` volvería a
  // filtrar de todas formas, pero para entonces las cifras ya se habrían leído.
  // Con el opt-in, no preguntar es parte de la promesa: si el usuario no
  // autorizó este ámbito, sus tablas ni se tocan.
  const permitidos = allowedDomains(scope).filter((d) => enabledDomains.includes(d));
  if (!permitidos.length) {
    const apagados = allowedDomains(scope).map((d) => DOMAIN_LABEL[d]);
    return {
      ok: false,
      created: 0,
      reason:
        apagados.length === 1
          ? `${apagados[0]} está apagado para el análisis. Enciéndelo en Configuración si quieres que sus cifras se envíen al modelo.`
          : `Ninguno de los dominios de este ámbito (${apagados.join(", ")}) está encendido. Actívalos en Configuración si quieres que sus cifras se envíen al modelo.`
    };
  }

  const facts = await loadFacts(supabase, user.id, permitidos, today, {
    quincenalIncome: profile?.quincenal_income ?? 0,
    window: {
      start: (profile?.activity_window_start ?? "08:00").slice(0, 5),
      end: (profile?.activity_window_end ?? "18:00").slice(0, 5)
    }
  });

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

  // Red de seguridad: el corte temprano ya cubrió este caso, pero `context.ts`
  // es el único sitio donde el filtro de privacidad manda (D-027) y si algún día
  // decide dejar la lista vacía por otro motivo, aquí se para igual.
  if (!context.domains.length) {
    return {
      ok: false,
      created: 0,
      reason: "Ningún dominio de este ámbito está autorizado para el análisis. Revísalo en Configuración."
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
      model: GEMINI_MODEL,
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

  revalidatePath(SCOPE_PATH[scope]);
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
  // La lista sale del tipo, no de una cadena escrita a mano: si mañana aparece
  // un dominio nuevo y esta línea se queda atrás, su casilla se guardaría como
  // apagada para siempre sin que nada falle.
  const domains = (Object.keys(DOMAIN_LABEL) as Domain[]).filter((d) => formData.get(`domain.${d}`) === "on");

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
