// src/lib/domain/agents/insights.ts
// El análisis nocturno, visto como agente (D-175) — lógica pura, probada en
// tests/domain/agents-insights.test.ts.
//
// POR QUÉ ES EL SEGUNDO AGENTE Y NO EL CENTRO
// El centro parecía el candidato natural —mismo patrón, misma cola de
// propuestas— hasta que se miró su punto de envoltura: `generarSugerencias`
// necesita `franja`, `destinos`, `proyectos` y `yaPropuestas`, cuatro entradas
// que `AgentInput` no lleva y que obligarían a ensanchar el contrato de TODOS
// los agentes para que quepa uno.
//
// `recommend(context)` no necesita nada de eso. Recibe un contexto y devuelve
// recomendaciones: encaja en el contrato **sin cambiarlo ni una línea**, que es
// la mejor prueba de que el contrato estaba bien planteado. Cuando dos
// candidatos compiten, gana el que no obliga a mover los cimientos.
//
// Sigue el mismo reparto que el coach: metadatos aquí, `ejecutar` en
// `lib/agents/insights-nocturno.ts`, para que esto se pueda probar.

import type { AnyAgentDefinition } from "./types.ts";

export const INSIGHTS_METADATOS: Omit<AnyAgentDefinition, "ejecutar"> = {
  id: "insights-nocturno",
  name: "Análisis nocturno",
  version: "1",
  descripcion: "Busca de noche lo que se salió de lo normal y te lo cuenta por la mañana.",

  /**
   * Los siete dominios que tienen extractor de hechos con algo que detectar.
   * `activity` queda fuera: mide lo que hiciste, no lo que se torció, y un
   * análisis de anomalías sobre la actividad propone mirarse el ombligo.
   */
  domains: ["money", "execution", "time", "habits", "debt", "nutrition", "growth"],

  /**
   * CINCO ÁREAS, NO SIETE, y la diferencia es deliberada.
   *
   * El coach sirve a las siete porque mira el conjunto. Éste no: no tiene ni un
   * hecho sobre relaciones ni sobre lo espiritual, y declararlas sería fingir
   * una cobertura que no existe. La consecuencia es buena: el día que llegue un
   * agente que SÍ sirva a Relaciones, `identidadesIncompatibles` podrá tener
   * algo que decir, cosa que con todos declarando las siete nunca pasaría.
   */
  identityServed: ["Salud", "Carrera", "Finanzas", "Aprendizaje", "Personal"],

  /** Solo de noche: es un repaso del día, no una interrupción. */
  triggers: ["cron.noche"],
  capabilities: ["detectar", "proponer"],

  /**
   * Riesgo bajo: deja recomendaciones que se leen cuando a la persona le
   * apetece, sin sonar el teléfono. Equivocarse cuesta una tarjeta que se
   * descarta, no una mañana estropeada. Por eso `politicas.ts` le da dos turnos
   * por franja y al coach solo uno.
   */
  riskLevel: "bajo",
  autonomyLevel: "propone",
  enabled: true,

  /**
   * Después del coach (10). Si alguna vez coinciden, lo urgente de la mañana va
   * antes que el repaso; que hoy no puedan coincidir —uno es de mañana y otro
   * de noche— no es razón para dejar el orden al azar.
   */
  priority: 20,

  /** El mismo `RECOMMEND_BUDGET`: es la tarea de más criterio de las tres. */
  budget: { maxOutputTokens: 12000, thinkingBudget: 4096 }
};
