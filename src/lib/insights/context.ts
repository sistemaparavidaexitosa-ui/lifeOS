// src/lib/insights/context.ts
// Intelligence OS — el ÚNICO punto donde se aplica el filtro de privacidad.
// Un solo archivo que auditar (§3.2 y §4 del spec del módulo).
//
// Es puro a propósito: recibe los hechos ya extraídos y devuelve el contexto
// que saldrá del servidor. La carga de datos vive en quien lo llama, para que
// estas reglas —que son las que importan— se puedan probar sin base de datos.

import type { Domain, Fact } from "../domain/insights/types.ts";

export type Scope = "money" | "debt" | "habits" | "time" | "execution" | "global";

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
    case "global":
      return ["money", "debt", "habits", "time", "execution"];
  }
}

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
}

export interface InsightContext {
  scope: Scope;
  domains: Domain[];
  /** Ya filtrados por allowlist, ordenados por peso, recortados y seudonimizados. */
  facts: Fact[];
  rejections: string[];
  /** Cuántos hechos se descartaron por el tope, para poder decirlo en la UI. */
  trimmed: number;
}

/**
 * Arma el contexto que se enviará al modelo. En orden: allowlist, ordenar por
 * peso, recortar, seudonimizar.
 */
export function buildContext(input: ContextInput): InsightContext {
  const domains = allowedDomains(input.scope, { projectIsWorkspace: input.projectIsWorkspace });
  const permitted = input.facts.filter((f) => domains.includes(f.domain));
  const ordered = [...permitted].sort((a, b) => b.weight - a.weight);
  const kept = ordered.slice(0, MAX_FACTS);
  const aliases = input.aliases;

  return {
    scope: input.scope,
    domains,
    facts: aliases ? kept.map((f) => ({ ...f, label: pseudonymize(f.label, aliases) })) : kept,
    rejections: (input.previousRejections ?? []).map((r) =>
      aliases ? pseudonymize(r.text, aliases) : r.text
    ),
    trimmed: ordered.length - kept.length
  };
}
