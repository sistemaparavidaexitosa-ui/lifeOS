// src/lib/domain/agents/seleccion.ts
// Qué agentes responden a un evento (D-171) — lógica pura, probada en
// tests/domain/agents-seleccion.test.ts.
//
// POR QUÉ EXISTE, Y POR QUÉ NO LA HACE EL MODELO
// La tentación evidente es pedirle al modelo que elija: sabe leer el evento,
// sabe leer las descripciones y acertaría casi siempre. «Casi siempre» es el
// problema. Un sistema que no puede explicar por qué actuó no se puede
// corregir, y en un producto cuyo propósito es la identidad, «no sé por qué te
// dijo eso» no es una limitación técnica: es un fallo de producto.
//
// Así que la selección es determinista, pura y probada. El modelo escribe
// dentro de un agente; nunca decide cuál corre.
//
// Esto NO es restraint. Aquí se responde «quién PUEDE actuar»; si conviene que
// alguno lo haga es la pregunta de politicas.ts, y son dos preguntas distintas
// a propósito: la primera es mecánica y la segunda es la que protege a la
// persona.

import type { Domain } from "../insights/types.ts";
import type { AgentEvent, AnyAgentDefinition } from "./types.ts";

/**
 * Los agentes que responden a este evento, en el orden en que deberían correr.
 *
 * `autorizados` son los dominios que la persona tiene encendidos en
 * `profiles.ai_domains`. La intersección se hace AQUÍ, antes de que nadie lea
 * una fila: un agente sin dominios autorizados no llega a existir para este
 * evento, en vez de correr y quedarse sin datos.
 */
export function agentesPara(
  evento: AgentEvent,
  agentes: readonly AnyAgentDefinition[],
  autorizados: readonly Domain[]
): AnyAgentDefinition[] {
  const permitidos = new Set(autorizados);

  return agentes
    .filter((a) => a.enabled)
    .filter((a) => a.triggers.includes(evento.tipo))
    // `some` y no `every`: un agente que mira dinero y hábitos sigue siendo
    // útil con solo hábitos encendidos —verá menos—, y exigir `every` lo
    // apagaría entero por un dominio secundario. Lo que NO puede es ver un
    // dominio apagado, y de eso se encarga `acotarContexto()`.
    .filter((a) => a.domains.some((d) => permitidos.has(d)))
    .sort(ordenDeEjecucion);
}

/**
 * Menor prioridad primero; a igualdad, por id.
 *
 * El desempate por id no es cosmético: sin él el orden lo decide el orden de
 * los imports, que nadie controla y que cambia al mover una línea. Un orden
 * inestable convierte cualquier prueba de «qué se propuso primero» en una
 * prueba que falla los martes.
 */
function ordenDeEjecucion(a: AnyAgentDefinition, b: AnyAgentDefinition): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id.localeCompare(b.id);
}

/**
 * Los dominios que este agente puede ver de verdad: lo que pide ∩ lo que la
 * persona autoriza.
 *
 * Separado de `agentesPara` porque el llamador lo necesita DESPUÉS, para acotar
 * el contexto (ver contexto.ts). Calcularlo dos veces con dos criterios sería
 * exactamente la clase de deriva que abre una puerta de privacidad.
 */
export function dominiosVisibles(
  agente: AnyAgentDefinition,
  autorizados: readonly Domain[]
): Domain[] {
  const permitidos = new Set(autorizados);
  return agente.domains.filter((d) => permitidos.has(d));
}
