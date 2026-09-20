import "server-only";

// src/lib/agents/insights-nocturno.ts
// El segundo agente del Kernel (D-175).
//
// ENCAJA SIN TOCAR EL CONTRATO, Y ESO ERA LO QUE HABÍA QUE AVERIGUAR
// El coach obligó a añadir `skippedDomains` (D-172) y luego `herramientas`
// (D-173). Un contrato que crece con cada agente nuevo no es un contrato, es
// una lista de peticiones. Éste no pidió nada: `recommend(context)` recibe un
// contexto y devuelve recomendaciones, así que el `AgentInput` de hoy le basta.
//
// Es la señal que se buscaba en la Fase 5. Con un solo agente no se puede saber
// si el contrato es común o si es el del coach con otro nombre.
//
// NO ESCRIBE, como todos. `recommend` no toca Supabase: valida el anclaje de
// las citas y devuelve borradores. Guardar las recomendaciones, auditar y
// aplicar el fingerprint sigue siendo trabajo de `recomendarYGuardar`.

import { recommend } from "@/lib/ai/recommend";
// Del dominio y no de `lib/ai/recommend`: el tipo es puro y allí solo está de
// paso, igual que pasaba con `Budget` antes de D-171.
import type { DraftRecommendation } from "@/lib/domain/insights/anchoring.ts";
import { INSIGHTS_METADATOS } from "@/lib/domain/agents/insights.ts";
import type { AgentDefinition, AgentInput } from "@/lib/domain/agents/types.ts";
import type { InsightContext } from "@/lib/insights/context";

export interface SalidaInsights {
  recomendaciones: DraftRecommendation[];
  /** Las que se cayeron por citar un hecho inexistente. Se auditan. */
  descartadas: { text: string; reason: string }[];
  /** El modelo de la cadena que contestó. */
  model?: string;
}

/**
 * Mismo puente que en `coach-diario.ts`, y por el mismo motivo: `AgentInput` no
 * habla el vocabulario del Intelligence OS a propósito (D-171).
 *
 * Que sean dos puentes casi idénticos en dos agentes NO es todavía duplicación
 * que merezca extraerse: comparten forma, no destino, y un helper compartido
 * ataría los dos agentes a una misma evolución del envase. Si aparece un
 * tercero, entonces sí.
 */
function contextoDeInsights(entrada: AgentInput): InsightContext {
  return {
    scope: "habits",
    domains: entrada.domains,
    skippedDomains: entrada.skippedDomains,
    facts: entrada.facts,
    rejections: entrada.rejections,
    memory: entrada.memory,
    trimmed: 0
  };
}

export function esSalidaInsights(v: unknown): v is SalidaInsights {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<SalidaInsights>;
  return Array.isArray(s.recomendaciones) && Array.isArray(s.descartadas);
}

export const insightsNocturno: AgentDefinition<SalidaInsights> = {
  ...INSIGHTS_METADATOS,

  async ejecutar(entrada) {
    if (entrada.evento.tipo !== "cron.noche") {
      return { ok: false, reason: `El análisis nocturno no corre ante ${entrada.evento.tipo}.` };
    }

    const resultado = await recommend(contextoDeInsights(entrada));

    // `recommend` devuelve `ok: true` con lista vacía cuando no hay nada
    // anómalo, y eso NO es un fallo: es el resultado correcto de una noche
    // tranquila. Se propaga tal cual para que quien guarde decida.
    if (!resultado.ok) {
      return { ok: false, reason: resultado.reason ?? "El análisis no pudo completarse." };
    }

    return {
      ok: true,
      datos: {
        recomendaciones: resultado.recommendations,
        descartadas: resultado.dropped,
        ...(resultado.model ? { model: resultado.model } : {})
      }
    };
  }
};
