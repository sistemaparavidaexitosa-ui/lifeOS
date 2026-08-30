// src/lib/domain/insights/memory.ts
// Memoria del motor (§6). Puro: recibe las filas ya leídas y la fecha de corte.
//
// La memoria es lo que separa un motor genérico de uno que conoce al usuario:
// sin ella sugerirá indefinidamente cosas que ya fueron decididas.

export type MemoryScope = "goal" | "project" | "finance" | "decision" | "preference" | "time" | "habit";
export type MemoryOrigin = "user" | "ai";

export interface MemoryItemLike {
  id: string;
  scope: MemoryScope;
  origin: MemoryOrigin;
  text: string;
  /** ISO date. `null` = no caduca. */
  validUntil: string | null;
}

/** Tope del §3.2: la memoria no puede comerse el contexto. */
export const MAX_MEMORY_ITEMS = 20;

/**
 * Qué scopes de memoria son relevantes para cada ámbito de análisis.
 *
 * `decision` y `preference` entran siempre: "no trabajo sábados" o "no me
 * sugieras despertarme más temprano" aplican mires lo que mires. Los demás son
 * del dominio que les toca.
 */
const SCOPE_RELEVANCE: Record<string, MemoryScope[]> = {
  money: ["finance", "decision", "preference"],
  debt: ["finance", "decision", "preference"],
  habits: ["habit", "goal", "decision", "preference"],
  time: ["time", "decision", "preference"],
  execution: ["project", "goal", "decision", "preference"],
  // La actividad del equipo se lee con las mismas reglas que los proyectos: un
  // "no me avises de X" o un "este proyecto lo lleva otro" aplican igual aquí.
  activity: ["project", "decision", "preference"],
  global: ["goal", "project", "finance", "decision", "preference", "time", "habit"]
};

/** Caducada = tenía fecha y ya pasó. Sin fecha, vive. */
export function isExpired(item: MemoryItemLike, todayISO: string): boolean {
  return item.validUntil !== null && item.validUntil < todayISO;
}

/**
 * Memoria vigente para un ámbito, priorizando la de scope coincidente y
 * recortada al tope.
 *
 * La priorización es por relevancia, no por fecha: una preferencia de hace un
 * año sigue siendo la preferencia del usuario. Dentro del mismo grupo se
 * conserva el orden de entrada, que quien llama fija (normalmente, la más
 * reciente primero).
 */
export function activeMemory(items: MemoryItemLike[], scope: string, todayISO: string): MemoryItemLike[] {
  const vigentes = items.filter((item) => !isExpired(item, todayISO));
  const relevantes = SCOPE_RELEVANCE[scope] ?? [];
  const propios = vigentes.filter((item) => relevantes.includes(item.scope));
  const resto = vigentes.filter((item) => !relevantes.includes(item.scope));
  return [...propios, ...resto].slice(0, MAX_MEMORY_ITEMS);
}
