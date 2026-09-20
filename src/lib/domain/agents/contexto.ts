// src/lib/domain/agents/contexto.ts
// Qué puede ver un agente (D-171) — lógica pura, probada en
// tests/domain/agents-contexto.test.ts.
//
// POR QUÉ EXISTE, Y POR QUÉ ES TAN PEQUEÑO
// El Kernel NO construye contexto. Eso ya lo hace `prepararAnalisis()` →
// `buildContext()` (D-027), que es el único punto donde manda el filtro de
// privacidad y el único archivo que hay que auditar para saber qué viaja al
// modelo. Escribir aquí un segundo ensamblador sería crear la quinta copia de
// una puerta de privacidad que ya está repetida cuatro veces en el repositorio:
// el peor sitio posible para practicar la duplicación.
//
// Lo único que falta es un ESTRECHAMIENTO: de lo que la persona autoriza, este
// agente concreto solo debe ver lo que declaró necesitar. Estrechar siempre es
// seguro; ensanchar no se puede desde aquí, y ese es todo el archivo.
//
// La conversión `InsightContext → AgentInput` vivirá en la capa de efectos
// cuando haya un llamador real (Fase 3). Escribirla hoy sería un adaptador sin
// consumidor.

import type { Domain, Fact } from "../insights/types.ts";
import { dominiosVisibles } from "./seleccion.ts";
import type { AgentEvent, AgentInput, AnyAgentDefinition } from "./types.ts";

/** Lo que la puerta de privacidad ya resolvió para esta persona. */
export interface ContextoAutorizado {
  userId: string;
  today: string;
  timeZone: string;
  /** `ai_domains` ∩ lo que el ámbito permite. Ya calculado por buildContext(). */
  domains: Domain[];
  facts: Fact[];
  memory: string[];
  rejections: string[];
}

export type ContextoDeAgente =
  | { ok: true; entrada: AgentInput }
  | { ok: false; reason: string };

/**
 * Estrecha el contexto autorizado a lo que este agente declaró necesitar.
 *
 * Si la intersección queda vacía, el agente NO corre: no recibe un contexto
 * pobre para que se las arregle, se corta aquí con un motivo. Un agente que
 * corre sin sus dominios produce texto que parece informado y no lo está, que
 * es peor que no producir nada.
 *
 * Los hechos se filtran por dominio además de los dominios: `buildContext` ya
 * los acotó a lo autorizado, pero «autorizado para la persona» no es
 * «declarado por este agente». Sin este filtro, un agente de hábitos leería
 * hechos de dinero solo porque la persona los tiene encendidos para otra cosa.
 */
export function acotarContexto(
  agente: AnyAgentDefinition,
  base: ContextoAutorizado,
  evento: AgentEvent
): ContextoDeAgente {
  const visibles = dominiosVisibles(agente, base.domains);

  if (visibles.length === 0) {
    return {
      ok: false,
      reason: `«${agente.name}» necesita dominios que tienes apagados para la IA.`
    };
  }

  const permitidos = new Set<Domain>(visibles);

  // Lo que ESTE agente pidió y no puede ver. Se calcula desde `agente.domains`
  // y no desde `base.skippedDomains` porque son dos preguntas distintas: al
  // agente no le sirve saber qué apagó la persona en general, sino qué le falta
  // a ÉL. Un agente de hábitos no debe disculparse por no ver el dinero que
  // nunca pidió.
  const sinPermiso = agente.domains.filter((d) => !permitidos.has(d));

  return {
    ok: true,
    entrada: {
      userId: base.userId,
      today: base.today,
      timeZone: base.timeZone,
      evento,
      domains: visibles,
      skippedDomains: sinPermiso,
      facts: base.facts.filter((f) => permitidos.has(f.domain)),
      // Memoria y rechazos son texto ya redactado por la persona o por sus
      // propias decisiones: no llevan dominio, así que no hay nada que
      // estrechar. Recortarlos por heurística sería adivinar.
      memory: base.memory,
      rejections: base.rejections
    }
  };
}
