// src/lib/domain/agents/coach.ts
// El coach diario, visto como agente (D-172) — lógica pura, probada en
// tests/domain/agents-coach.test.ts.
//
// POR QUÉ ESTE ARCHIVO EXISTE SEPARADO DE `lib/agents/coach-diario.ts`
// Un agente real tiene dos mitades con destinos distintos: lo que DECLARA
// (dominios, identidad a la que sirve, disparos, presupuesto) y lo que HACE
// (`ejecutar`, que llama al modelo y por tanto lleva `server-only`).
//
// Si vivieran juntas, la declaración sería inalcanzable para los tests: todo el
// archivo arrastraría `server-only` y `tests/domain/` no podría importarlo. Y
// la declaración es justo la parte que conviene probar —es la que decide qué
// datos ve el agente y cuándo se le permite hablar—.
//
// De ahí el patrón que los agentes siguientes deberían copiar:
//   dominio  → metadatos + reglas puras (este archivo)
//   efectos  → los mismos metadatos + `ejecutar` (lib/agents/<agente>.ts)

import type { Momento } from "../coach/schedule.ts";
import type { AgentTrigger, AnyAgentDefinition } from "./types.ts";

/**
 * Todo lo que el coach declara, menos `ejecutar`.
 *
 * `Omit<…, "ejecutar">` y no un tipo a mano: así, el día que el contrato gane
 * un campo obligatorio, este objeto deja de compilar. Un agente cuyos metadatos
 * se quedan viejos en silencio es exactamente lo que `validarAgente()` no puede
 * atrapar, porque sintácticamente todo está bien.
 */
export const COACH_METADATOS: Omit<AnyAgentDefinition, "ejecutar"> = {
  id: "coach-diario",
  name: "Coach diario",
  version: "1",
  descripcion: "Mira tu día entero y elige las pocas cosas que merecen decirse.",

  /**
   * Los ocho dominios, y no es un descuido: el coach existe precisamente para
   * mirar la vida completa antes de elegir tres cosas (por eso usa
   * `MAX_FACTS_COACH = 120` y no los 40 del chat). Pedirlos todos NO significa
   * que los vea todos: `acotarContexto()` interseca con `profiles.ai_domains`,
   * y lo que la persona tenga apagado no llega aquí ni se nombra.
   */
  domains: ["money", "execution", "time", "habits", "debt", "activity", "nutrition", "growth"],

  /**
   * Las siete áreas, por la misma razón: un coach que solo sirviera a «Salud»
   * no podría decirte que llevas tres semanas sin abrir el proyecto que te
   * importa. El efecto secundario es que **el coach nunca choca con nadie**
   * —`identidadesIncompatibles` exige no compartir NINGÚN área—, que es lo
   * correcto para el agente que mira el conjunto.
   */
  identityServed: ["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"],

  triggers: ["cron.manana", "cron.noche"],
  capabilities: ["proponer", "resumir"],

  /**
   * Riesgo medio: se equivoca contigo, no con tus datos. No escribe nada —sus
   * propuestas las acepta la persona— pero un mensaje mal calibrado a las seis
   * de la mañana sí tiene coste. Con `medio`, `politicas.ts` le da UNA vez por
   * franja, que es justo lo que el camino actual ya hacía con `claveDelCoach`.
   */
  riskLevel: "medio",
  autonomyLevel: "propone",
  enabled: true,

  /**
   * Prioridad 10, dejando sitio por debajo a propósito. El coach es el agente
   * de fondo: cualquier agente futuro que responda a algo puntual —un hábito
   * recién completado— debe hablar antes que el resumen del día.
   */
  priority: 10,

  /** El mismo `COACH_BUDGET` de siempre, declarado donde ahora se exige. */
  budget: { maxOutputTokens: 4000, thinkingBudget: 2048 }
};

/**
 * Qué momento del día es este disparo.
 *
 * Existe porque el Kernel habla de disparos y el coach habla de momentos, y la
 * traducción tiene que estar en UN sitio y ser probable. Devuelve `null` para
 * cualquier otro disparo en vez de suponer «mañana»: un coach que saluda con
 * «buenos días» porque alguien abrió el centro a las once de la noche es el
 * tipo de fallo que nadie reporta y todo el mundo nota.
 */
export function momentoDelDisparo(trigger: AgentTrigger): Momento | null {
  if (trigger === "cron.manana") return "morning";
  if (trigger === "cron.noche") return "night";
  return null;
}
