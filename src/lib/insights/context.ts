// src/lib/insights/context.ts
// Intelligence OS — el ÚNICO punto donde se aplica el filtro de privacidad.
// Un solo archivo que auditar (§3.2 y §4 del spec del módulo).
//
// Es puro a propósito: recibe los hechos ya extraídos y devuelve el contexto
// que saldrá del servidor. La carga de datos vive en quien lo llama, para que
// estas reglas —que son las que importan— se puedan probar sin base de datos.
//
// QUÉ CAMBIÓ EN 0053, y conviene decirlo aquí porque este archivo ERA el que
// prometía lo contrario: se retiró la seudonimización. Los nombres de cuentas,
// personas, metas y notas salen tal cual hacia el modelo. La decisión es del
// dueño del sistema, tomada con la consecuencia delante: un coach que dice
// «Cuenta #2» y «Dependiente #1» no puede hablar de la vida de nadie. Lo que
// NO cambió es lo que hace auditable el resto: la lista blanca de tablas sigue
// aquí, sigue siendo blanca, y sigue mandando `profiles.ai_domains`.

import type { Domain, Fact } from "../domain/insights/types.ts";
import type { Database } from "../../types/database.types.ts";
import { activeMemory, type MemoryItemLike } from "../domain/insights/memory.ts";

export type Scope =
  | "money"
  | "debt"
  | "habits"
  | "time"
  | "execution"
  | "activity"
  | "nutrition"
  | "growth"
  | "global";

/** Tope de arranque (§3.2). Los hechos de mayor peso son los que sobreviven. */
export const MAX_FACTS = 40;

/**
 * El tope del coach. Los cuarenta de `MAX_FACTS` se pensaron para una pantalla
 * de recomendaciones donde el modelo elige tres; el mensaje diario tiene que
 * mirar la vida entera antes de decidir qué merece decirse, y con cuarenta se
 * quedaba sin ver dominios completos.
 */
export const MAX_FACTS_COACH = 120;

/**
 * El scope NO es una etiqueta: es un allowlist de extractores (§4.1).
 *
 * La regla transversal es que solo entran hechos donde el usuario es el
 * sujeto. Y la fila que de verdad importa es la de `execution`: en un proyecto
 * de workspace **no hay dominios privados en el contexto**, así que no queda
 * nada a lo que un título de tarea escrito por un tercero pueda apuntar (§4.3).
 */
export function allowedDomains(scope: Scope, options: { projectIsWorkspace?: boolean } = {}): Domain[] {
  switch (scope) {
    case "money":
      return ["money"];
    case "debt":
      return ["debt"];
    case "habits":
      return ["habits"];
    case "nutrition":
      return ["nutrition"];
    case "growth":
      return ["growth"];
    case "time":
      return ["time"];
    case "execution":
      return options.projectIsWorkspace ? ["execution"] : ["execution", "time"];
    case "activity":
      return ["activity"];
    case "global":
      // `activity` ENTRA, y esto invierte lo que decía este mismo archivo.
      //
      // El argumento anterior era bueno para un motor de recomendaciones:
      // global es «tu vida» y la actividad es «la semana de tu equipo»,
      // mezclarlas metía a otras personas en un análisis que el usuario pidió
      // sobre sí mismo. Pero el chat y el coach no son ese motor: cuando
      // alguien pregunta «¿qué pasó esta semana?», lo que hizo con su equipo
      // ES parte de su semana, y dejarlo fuera obligaba al chat a contestar
      // que no tenía acceso —que fue exactamente lo que pasó—. La RLS sigue
      // decidiendo qué actividad puede ver: esto no abre ninguna fila nueva,
      // solo deja de esconder las que ya podía leer.
      return ["money", "debt", "habits", "time", "execution", "nutrition", "growth", "activity"];
  }
}

/**
 * LA LISTA BLANCA DE CONSULTA (D-097).
 *
 * Las herramientas del modelo pueden bajar de los hechos a la fila. Esto es lo
 * ÚNICO que decide a qué filas, y vive aquí —y no en `lib/ai/tools.ts`— por la
 * misma razón que todo lo demás de este archivo: el filtro de privacidad tiene
 * que caber en un sitio que se pueda auditar de una sentada. Repartirlo entre
 * dos archivos es perder eso.
 *
 * Tres propiedades que se defienden con pruebas, no con buena voluntad:
 *
 * 1. **Es una lista blanca, no una negra.** Lo que no está, no se consulta. Por
 *    eso `profiles`, `audit_log`, `ai_chat_messages`, `consents`,
 *    `push_subscriptions`, `memberships`, `invitations` o `template_catalog` no
 *    aparecen: no hace falta acordarse de excluirlas. Creció de once tablas a
 *    cuarenta y cuatro en 0053, y esa propiedad es justo lo que permitió que
 *    creciera sin volver a discutir cada exclusión.
 * 2. **Cada tabla declara su dominio**, así que el opt-in de
 *    `profiles.ai_domains` sigue mandando igual que sobre los hechos. Sin el
 *    dominio encendido, la tabla no existe para el modelo.
 * 3. **Cada tabla declara por qué columna se acota la ventana** —o dice que no
 *    tiene ninguna—, porque una consulta sin ventana devuelve la vida entera
 *    del usuario y el tope de filas la cortaría por donde cayera.
 */
export interface TablaConsultable {
  domain: Domain;
  /**
   * Columna por la que se acota la ventana de fechas, o `null` cuando la tabla
   * no tiene ninguna. `null` se reserva a catálogos pequeños y acotados por
   * naturaleza —`categories`, `nutrition_profiles`, `folders`, `task_groups`—
   * donde traerlo todo cabe de sobra bajo `MAX_FILAS_CONSULTA` y una ventana
   * de fechas solo serviría para esconder filas al azar.
   */
  fecha: string | null;
  /** Qué columnas se traen. Se declara para NO traer un `*` que crezca solo. */
  select: string;
}

/**
 * El `satisfies` no es decorativo: ata las claves a las tablas que EXISTEN
 * según los tipos generados, así que una tabla mal escrita —o una que se
 * renombre en una migración futura— no compila. Y al ser `satisfies` y no una
 * anotación, las claves conservan su tipo literal, que es lo que permite
 * pasárselas al cliente de Supabase sin un `as`.
 */
export const TABLAS_CONSULTABLES = {
  // ---------------------------------------------------------------- dinero
  // `journal_entries` trae sus líneas embebidas porque el importe vive en la
  // hija: sin ellas, «¿cuánto gasté en esto?» no se puede contestar.
  journal_entries: {
    domain: "money",
    fecha: "entry_date",
    select: "id, type, memo, entry_date, category, counterparty, journal_lines(amount, account_id)"
  },
  budgets: { domain: "money", fecha: "created_at", select: "id, category, monthly_cost, q1_amount, q2_amount, period, created_at" },
  budget_carryovers: { domain: "money", fecha: "created_at", select: "id, budget_id, period_key, amount, created_at" },
  accounts: { domain: "money", fecha: "created_at", select: "id, name, type, currency, created_at" },
  categories: { domain: "money", fecha: null, select: "id, name" },
  savings_goals: { domain: "money", fecha: "created_at", select: "id, name, type, target, current_amount, monthly, priority, target_date, created_at" },
  financial_goals: { domain: "money", fecha: "created_at", select: "id, name, target, current_amount, horizon, priority, created_at" },
  investments: { domain: "money", fecha: "created_at", select: "id, name, kind, institution, principal, valuation, rate, currency, as_of, created_at" },
  assets: { domain: "money", fecha: "created_at", select: "id, name, kind, value, currency, as_of, created_at" },
  liabilities: { domain: "money", fecha: "created_at", select: "id, name, value, currency, as_of, created_at" },
  net_worth_snapshots: { domain: "money", fecha: "created_at", select: "id, as_of, assets, liabilities, net, created_at" },
  cashback_cards: { domain: "money", fecha: "created_at", select: "id, name, rate_pct, eligible_categories, accrued_estimate, created_at" },
  cashback_redemptions: { domain: "money", fecha: "redeemed_at", select: "id, card_id, amount, redeemed_at" },
  family_members: { domain: "money", fecha: "created_at", select: "id, name, member_type, relationship, created_at" },

  // ---------------------------------------------------------------- deudas
  debts: { domain: "debt", fecha: "created_at", select: "id, name, balance, rate, min_payment, due_day, created_at" },

  // --------------------------------------------------------------- hábitos
  habits: { domain: "habits", fecha: "created_at", select: "id, name, category, routine_id, duration_min, position, created_at" },
  habit_logs: { domain: "habits", fecha: "log_date", select: "id, habit_id, log_date" },
  routines: { domain: "habits", fecha: "created_at", select: "id, name, frequency, identity, active, occupation_id, created_at" },
  routine_runs: { domain: "habits", fecha: "local_date", select: "id, routine_id, local_date, completed_at" },

  // ---------------------------------------------------------------- tiempo
  occupations: { domain: "time", fecha: "created_at", select: "id, title, category, start_time, end_time, days, occ_date, recurring, created_at" },

  // -------------------------------------------------------------- ejecución
  tasks: { domain: "execution", fecha: "created_at", select: "id, title, status, priority, due, est, impact, project_id, group_id, completed_at, created_at" },
  projects: { domain: "execution", fecha: "created_at", select: "id, title, status, area, priority, tags, target_date, workspace_id, created_at" },
  task_groups: { domain: "execution", fecha: null, select: "id, project_id, name, position" },
  task_history: { domain: "execution", fecha: "ts", select: "id, task_id, from_state, to_state, ts" },
  daily_plans: { domain: "execution", fecha: "local_date", select: "id, local_date, one_thing, one_thing_task_id, one_thing_project_id, task_ids, approved, approved_at" },
  weekly_reviews: { domain: "execution", fecha: "review_date", select: "id, review_date, completed_count, progress_pct, blocked_count" },
  logbook: { domain: "execution", fecha: "created_at", select: "id, project_id, type, text, created_at" },
  reminders: { domain: "execution", fecha: "remind_on", select: "id, subject_type, subject_id, text, remind_on, remind_at, done" },
  notebooks: { domain: "execution", fecha: "created_at", select: "id, title, icon, workspace_id, created_at, updated_at" },
  notes: { domain: "execution", fecha: "updated_at", select: "id, notebook_id, title, body, updated_at, created_at" },
  folders: { domain: "execution", fecha: null, select: "id, name, workspace_id, position" },
  knowledge_items: { domain: "execution", fecha: "created_at", select: "id, project_id, type, title, url, note, created_at" },

  // ------------------------------------------------------ desarrollo personal
  personal_goals: { domain: "growth", fecha: "created_at", select: "id, title, description, area, horizon, status, achieved_at, created_at" },
  key_results: { domain: "growth", fecha: "created_at", select: "id, goal_id, title, source_kind, source_id, target, manual_current, baseline, unit, position, created_at" },
  books: { domain: "growth", fecha: "updated_at", select: "id, title, author, category, status, current_page, total_pages, started_at, finished_at, updated_at" },
  book_notes: { domain: "growth", fecha: "created_at", select: "id, book_id, text, page_ref, created_at" },
  book_progress: { domain: "growth", fecha: "local_date", select: "id, book_id, local_date, page" },
  reading_plan_weeks: { domain: "growth", fecha: "week_start", select: "id, book_id, week_start, position" },

  // ------------------------------------------------------------- nutrición
  nutrition_profiles: { domain: "nutrition", fecha: null, select: "sex, birth_date, height_cm, weight_kg, fat_pct, activity_level, goal, protein_g_per_kg, kcal_override, updated_at" },
  food_entries: { domain: "nutrition", fecha: "local_date", select: "id, local_date, meal, name, brand, grams, kcal, protein_g, carbs_g, fat_g" },
  body_measurements: { domain: "nutrition", fecha: "local_date", select: "id, local_date, weight_kg, body_fat_pct" },

  // -------------------------------------------------------------- actividad
  // Filas escritas por OTRAS personas. La RLS ya decide cuáles se ven; lo que
  // se declara aquí es que el modelo puede leerlas, no que existan más.
  workspace_activity: { domain: "activity", fecha: "created_at", select: "id, workspace_id, project_id, type, text, actor, created_at" },
  comments: { domain: "activity", fecha: "created_at", select: "id, subject_type, subject_id, body, author_name, mentions, created_at" },
  comment_reactions: { domain: "activity", fecha: "created_at", select: "comment_id, emoji, created_at" }
} satisfies Partial<Record<keyof Database["public"]["Tables"], TablaConsultable>>;

/** Los nombres de tabla que una herramienta puede nombrar. */
export type TablaConsultableNombre = keyof typeof TABLAS_CONSULTABLES;

/**
 * La tabla que se puede consultar, o `null`. `null` cubre los dos «no» y no
 * los distingue a propósito: decirle al modelo «esa tabla existe pero no la
 * autorizaste» ya es contarle algo del usuario.
 */
export function tablaConsultable(
  tabla: string,
  autorizados: readonly Domain[]
): (TablaConsultable & { nombre: TablaConsultableNombre }) | null {
  const meta = (TABLAS_CONSULTABLES as Record<string, TablaConsultable | undefined>)[tabla];
  if (!meta) return null;
  // El nombre vuelve tipado para que el cliente de Supabase lo acepte sin un
  // `as` en el sitio donde de verdad importa que sea una tabla real.
  return autorizados.includes(meta.domain) ? { ...meta, nombre: tabla as TablaConsultableNombre } : null;
}

/**
 * Tope de filas por consulta. No es rendimiento: es que lo que vuelve va DENTRO
 * del prompt de la siguiente llamada, y doscientas filas de diario se comen la
 * ventana y la cuota que la cadena de modelos acaba de ganar.
 */
export const MAX_FILAS_CONSULTA = 50;

export interface PreviousRejection {
  /** `Suppressed` o `Reported`: el motor lee su propio historial de rechazos. */
  status: string;
  text: string;
}

export interface ContextInput {
  scope: Scope;
  facts: Fact[];
  previousRejections?: PreviousRejection[];
  projectIsWorkspace?: boolean;
  /**
   * Dominios que el usuario autorizó a enviar al modelo (§4.2,
   * `profiles.ai_domains`). Distinto del allowlist: aquel dice qué PUEDE ver
   * este ámbito, este dice qué QUIERE el usuario que salga. Solo pasa la
   * intersección. Ausente = no se aplica el filtro (retrocompatible).
   */
  enabledDomains?: Domain[];
  /** Memoria del usuario, ya leída. Se filtra por vigencia y relevancia aquí. */
  memory?: MemoryItemLike[];
  /** "Hoy" en la zona del usuario, para decidir qué memoria caducó (D-018). */
  todayISO?: string;
  /** Tope de hechos. Por defecto `MAX_FACTS`; el coach pide `MAX_FACTS_COACH`. */
  maxFacts?: number;
}

export interface InsightContext {
  scope: Scope;
  /** Los que de verdad viajan: allowlist ∩ autorizados por el usuario. */
  domains: Domain[];
  /**
   * Los que el ámbito permitía pero el usuario tiene apagados. La UI los dice
   * explícitamente en vez de fingir cobertura total (§4.2).
   */
  skippedDomains: Domain[];
  /** Ya filtrados por allowlist, ordenados por peso y recortados. */
  facts: Fact[];
  rejections: string[];
  /** Memoria vigente y relevante. */
  memory: string[];
  /** Cuántos hechos se descartaron por el tope, para poder decirlo en la UI. */
  trimmed: number;
}

/**
 * Arma el contexto que se enviará al modelo. En orden: allowlist, ordenar por
 * peso, recortar.
 */
export function buildContext(input: ContextInput): InsightContext {
  const allowed = allowedDomains(input.scope, { projectIsWorkspace: input.projectIsWorkspace });
  // Allowlist ∩ opt-in. Lo que el ámbito permite Y el usuario autorizó.
  const domains = input.enabledDomains ? allowed.filter((d) => input.enabledDomains!.includes(d)) : allowed;
  const skippedDomains = allowed.filter((d) => !domains.includes(d));

  const permitted = input.facts.filter((f) => domains.includes(f.domain));
  const ordered = [...permitted].sort((a, b) => b.weight - a.weight);
  const kept = ordered.slice(0, input.maxFacts ?? MAX_FACTS);

  const memory =
    input.memory && input.todayISO ? activeMemory(input.memory, input.scope, input.todayISO).map((m) => m.text) : [];

  return {
    scope: input.scope,
    domains,
    skippedDomains,
    facts: kept,
    rejections: (input.previousRejections ?? []).map((r) => r.text),
    memory,
    trimmed: ordered.length - kept.length
  };
}
