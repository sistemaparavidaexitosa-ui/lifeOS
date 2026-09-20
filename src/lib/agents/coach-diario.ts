import "server-only";

// src/lib/agents/coach-diario.ts
// El primer agente real del Kernel (D-172).
//
// POR QUÉ ENVUELVE `generarMensajeCoach` Y NO `generarYGuardarMensajeDiario`
// El orquestador del coach (`lib/coach/daily.ts`) hace tres cosas: reúne el
// contexto, piensa, y ESCRIBE —el turno en `ai_chat_messages`, las propuestas
// en `coach_proposals`, el rastro en `audit_log`—. Un agente no escribe (D-171):
// su salida es una propuesta que una Server Action con la sesión de la persona
// materializa después.
//
// Así que el punto de envoltura es la mitad de en medio, y encaja sin forzar
// nada porque ya estaba escrita con esa frontera. `generarMensajeCoach` no
// importa Supabase, no sabe qué es un `user_id` y devuelve las propuestas sin
// guardarlas; su propia cabecera lo dice: «recibe hechos ya calculados y
// devuelve texto; quien la llama decide si algo de esto se guarda».
//
// Eso es la respuesta a la pregunta que abrió la Fase 2 —¿sirve el contrato
// para un agente de verdad?—: sirve, y sirve porque el repositorio ya separaba
// pensar de escribir antes de que existiera el Kernel.
//
// LO QUE ESTE AGENTE TODAVÍA NO HACE
// No recibe `CajaDeHerramientas`, así que no puede pedir más hechos con
// `leer_hechos` a mitad de razonar; piensa solo sobre lo que `AgentInput` le
// dio. El camino actual sí se la pasa. Es la diferencia de conducta que hay que
// cerrar antes de sustituir a nadie (Fase 3), y está en CHECKS.

import { generarMensajeCoach, type CoachPropuesta } from "@/lib/coach/generar";
import { COACH_METADATOS, momentoDelDisparo } from "@/lib/domain/agents/coach.ts";
import type { AgentDefinition, AgentInput } from "@/lib/domain/agents/types.ts";
import type { InsightContext } from "@/lib/insights/context";

/** Lo que el agente devuelve. Mismo contenido que `CoachResult`, sin el `ok`. */
export interface SalidaCoach {
  resumen: string;
  mensaje: string;
  propuestas: CoachPropuesta[];
  factIds: string[];
}

/**
 * Del vocabulario del Kernel al del Intelligence OS.
 *
 * `AgentInput` no lleva un `InsightContext` a propósito (D-171): el dominio no
 * puede importar la capa de aplicación, y atar el contrato de TODO agente al
 * vocabulario de Insights habría sido el acoplamiento que el Kernel existe para
 * evitar. La costura tiene que estar en algún sitio, y este es el sitio: en el
 * agente que necesita ese envase, no en el contrato que comparten todos.
 *
 * No recalcula nada. `buildContext()` ya filtró, ordenó y recortó; esto solo
 * vuelve a poner los mismos datos en la caja que `generarMensajeCoach` espera.
 * Si un segundo agente lo necesita, se sube a `lib/agents/` y se comparte; hoy
 * sería un adaptador con un solo consumidor.
 */
function contextoDelCoach(entrada: AgentInput): InsightContext {
  return {
    scope: "global",
    domains: entrada.domains,
    skippedDomains: entrada.skippedDomains,
    facts: entrada.facts,
    rejections: entrada.rejections,
    memory: entrada.memory,
    // `buildContext` ya recortó a `MAX_FACTS_COACH` antes de llegar aquí: lo
    // que se perdió se perdió allí, y decir otro número sería mentir sobre
    // dónde ocurrió el recorte.
    trimmed: 0
  };
}

export const coachDiario: AgentDefinition<SalidaCoach> = {
  ...COACH_METADATOS,

  async ejecutar(entrada) {
    const momento = momentoDelDisparo(entrada.evento.tipo);
    if (!momento) {
      // No se supone «mañana». Un coach que saluda con «buenos días» a las once
      // de la noche es el fallo que nadie reporta y todo el mundo nota.
      return { ok: false, reason: `El coach no sabe qué decir ante ${entrada.evento.tipo}.` };
    }

    const resultado = await generarMensajeCoach({
      context: contextoDelCoach(entrada),
      momento,
      today: entrada.today
    });

    if (!resultado.ok) {
      return { ok: false, reason: resultado.reason ?? "El coach no pudo escribir hoy." };
    }

    return {
      ok: true,
      datos: {
        resumen: resultado.resumen,
        mensaje: resultado.mensaje,
        propuestas: resultado.propuestas,
        factIds: resultado.factIds
      }
    };
  }
};
