// src/lib/insights/context.ts
// Intelligence OS — el ÚNICO punto donde se aplica el filtro de privacidad.
// Un solo archivo que auditar (§3.2 y §4 del spec del módulo).
//
// Es puro a propósito: recibe los hechos ya extraídos y devuelve el contexto
// que saldrá del servidor. La carga de datos vive en quien lo llama, para que
// estas reglas —que son las que importan— se puedan probar sin base de datos.

import type { Domain, Fact } from "../domain/insights/types.ts";
import type { Database } from "../../types/database.types.ts";
import { activeMemory, type MemoryItemLike } from "../domain/insights/memory.ts";

export type Scope = "money" | "debt" | "habits" | "time" | "execution" | "activity" | "global";

/** Tope de arranque (§3.2). Los hechos de mayor peso son los que sobreviven. */
export const MAX_FACTS = 40;

/**
 * El scope NO es una etiqueta: es un allowlist de extractores (§4.1).
 *
 * La regla transversal es que solo entran hechos donde el usuario es el
 * sujeto. Y la fila que de verdad importa es la última: en un proyecto de
 * workspace **no hay dominios privados en el contexto**, así que no queda nada
 * a lo que un título de tarea escrito por un tercero pueda apuntar (§4.3).
 */
export function allowedDomains(scope: Scope, options: { projectIsWorkspace?: boolean } = {}): Domain[] {
  switch (scope) {
    case "money":
      return ["money"];
    case "debt":
      return ["debt"];
    case "habits":
      return ["habits"];
    case "time":
      return ["time"];
    case "execution":
      return options.projectIsWorkspace ? ["execution"] : ["execution", "time"];
    case "activity":
      // Solo el suyo, y DELIBERADAMENTE fuera de `global`. Global es «tu vida»
      // —tus cifras, tu agenda, tus hábitos—; esto es «la semana de tu equipo».
      // Mezclarlas metería la actividad de otras personas dentro de un análisis
      // que el usuario pidió sobre sí mismo.
      return ["activity"];
    case "global":
      return ["money", "debt", "habits", "time", "execution"];
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
 *    eso `profiles`, `audit_log`, `ai_chat_messages`, `consents` o cualquier
 *    tabla de workspace no aparecen: no hace falta acordarse de excluirlas.
 * 2. **Cada tabla declara su dominio**, así que el opt-in de
 *    `profiles.ai_domains` sigue mandando igual que sobre los hechos. Sin el
 *    dominio encendido, la tabla no existe para el modelo.
 * 3. **Cada tabla declara por qué columna se acota la ventana**, porque una
 *    consulta sin ventana devuelve la vida entera del usuario y el `max_rows`
 *    de PostgREST la cortaría por donde cayera.
 *
 * `activity` no está y no puede estar: `allowedDomains('global')` la deja
 * fuera a propósito —es la semana del equipo, no la vida del usuario— y una
 * prueba comprueba que ninguna entrada se escape de global.
 */
export interface TablaConsultable {
  domain: Domain;
  /** Columna por la que se acota la ventana de fechas. */
  fecha: string;
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
  // Dinero. `journal_entries` trae sus líneas embebidas porque el importe vive
  // en la hija: sin ellas, «¿cuánto gasté en esto?» no se puede contestar.
  journal_entries: {
    domain: "money",
    fecha: "entry_date",
    select: "id, type, memo, entry_date, category, counterparty, journal_lines(amount, account_id)"
  },
  budgets: { domain: "money", fecha: "created_at", select: "id, category, monthly_cost, created_at" },
  accounts: { domain: "money", fecha: "created_at", select: "id, name, type, currency, created_at" },

  debts: { domain: "debt", fecha: "created_at", select: "id, name, balance, rate, min_payment, due_day, created_at" },

  habits: { domain: "habits", fecha: "created_at", select: "id, name, category, routine_id, duration_min, created_at" },
  habit_logs: { domain: "habits", fecha: "log_date", select: "id, habit_id, log_date" },
  routines: { domain: "habits", fecha: "created_at", select: "id, name, frequency, identity, active, created_at" },
  routine_runs: { domain: "habits", fecha: "local_date", select: "id, routine_id, local_date, completed_at" },

  occupations: { domain: "time", fecha: "created_at", select: "id, title, category, start_time, end_time, days, occ_date, created_at" },

  tasks: { domain: "execution", fecha: "created_at", select: "id, title, status, due, project_id, created_at" },
  projects: { domain: "execution", fecha: "created_at", select: "id, title, status, area, target_date, created_at" }
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

/**
 * Mapa alias↔real para seudonimizar antes de salir del servidor (§4.2).
 * Nunca sale del proceso: al renderizar se re-sustituye con `restore`.
 */
export interface AliasMap {
  toAlias: Map<string, string>;
  toReal: Map<string, string>;
}

export interface NamedEntity {
  kind: "account" | "member";
  name: string;
}

const ALIAS_LABEL: Record<NamedEntity["kind"], string> = {
  account: "Cuenta",
  member: "Dependiente"
};

/**
 * Alias estables dentro de un análisis: `Cuenta #1`, `Dependiente #2`. El
 * orden lo fija quien llama (normalmente el de la base), no el azar, para que
 * dos análisis seguidos no renombren las mismas cosas.
 *
 * Los nombres vacíos o de un solo carácter se ignoran: sustituir la letra "a"
 * en todo el texto destrozaría el contexto sin proteger nada.
 */
export function buildAliasMap(entities: NamedEntity[]): AliasMap {
  const toAlias = new Map<string, string>();
  const toReal = new Map<string, string>();
  const counters: Record<NamedEntity["kind"], number> = { account: 0, member: 0 };

  for (const entity of entities) {
    const name = entity.name.trim();
    if (name.length < 2 || toAlias.has(name)) continue;
    counters[entity.kind] += 1;
    const alias = `${ALIAS_LABEL[entity.kind]} #${counters[entity.kind]}`;
    toAlias.set(name, alias);
    toReal.set(alias, name);
  }
  return { toAlias, toReal };
}

function replaceAll(text: string, pairs: Map<string, string>): string {
  // Los nombres largos primero: sustituir "Ana" antes que "Ana María" partiría
  // el nombre largo por la mitad y dejaría escapar el resto.
  const ordered = [...pairs.entries()].sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [from, to] of ordered) out = out.split(from).join(to);
  return out;
}

/** Sustituye nombres reales por alias. Se aplica a TODO lo que sale del servidor. */
export function pseudonymize(text: string, map: AliasMap): string {
  return replaceAll(text, map.toAlias);
}

/** Devuelve los nombres reales al renderizar. El mapa nunca salió de aquí. */
export function restore(text: string, map: AliasMap): string {
  return replaceAll(text, map.toReal);
}

export interface PreviousRejection {
  /** `Suppressed` o `Reported`: el motor lee su propio historial de rechazos. */
  status: string;
  text: string;
}

export interface ContextInput {
  scope: Scope;
  facts: Fact[];
  previousRejections?: PreviousRejection[];
  aliases?: AliasMap;
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
  /** Ya filtrados por allowlist, ordenados por peso, recortados y seudonimizados. */
  facts: Fact[];
  rejections: string[];
  /** Memoria vigente y relevante, ya seudonimizada. */
  memory: string[];
  /** Cuántos hechos se descartaron por el tope, para poder decirlo en la UI. */
  trimmed: number;
}

/**
 * Arma el contexto que se enviará al modelo. En orden: allowlist, ordenar por
 * peso, recortar, seudonimizar.
 */
export function buildContext(input: ContextInput): InsightContext {
  const allowed = allowedDomains(input.scope, { projectIsWorkspace: input.projectIsWorkspace });
  // Allowlist ∩ opt-in. Lo que el ámbito permite Y el usuario autorizó.
  const domains = input.enabledDomains ? allowed.filter((d) => input.enabledDomains!.includes(d)) : allowed;
  const skippedDomains = allowed.filter((d) => !domains.includes(d));

  const permitted = input.facts.filter((f) => domains.includes(f.domain));
  const ordered = [...permitted].sort((a, b) => b.weight - a.weight);
  const kept = ordered.slice(0, MAX_FACTS);
  const aliases = input.aliases;
  const hide = (text: string) => (aliases ? pseudonymize(text, aliases) : text);

  const memory =
    input.memory && input.todayISO
      ? activeMemory(input.memory, input.scope, input.todayISO).map((m) => hide(m.text))
      : [];

  return {
    scope: input.scope,
    domains,
    skippedDomains,
    facts: aliases ? kept.map((f) => ({ ...f, label: pseudonymize(f.label, aliases) })) : kept,
    rejections: (input.previousRejections ?? []).map((r) => hide(r.text)),
    memory,
    trimmed: ordered.length - kept.length
  };
}
