import "server-only";

// src/lib/agents/bitacora.ts
// Lo que el Kernel recuerda de sí mismo (D-174).
//
// POR QUÉ EXISTE
// Dos preguntas que hasta hoy no se podían responder:
//
//  1. **¿Cuántas veces decidió callarse?** Desde D-171 el veredicto por defecto
//     es no actuar, y CHECKS lo viene diciendo en cada entrega: la proporción de
//     silencios no se puede leer porque no hay dónde guardarla. Un silencio que
//     no se registra es indistinguible de un fallo, y la métrica declarada del
//     Kernel —que esa proporción SUBA con el tiempo— era, hasta ahora, una
//     aspiración sin instrumento.
//  2. **¿Qué ha decidido la persona sobre lo que se le propuso?** Es la materia
//     prima de `domain/agents/aprendizaje.ts`.
//
// SIN MIGRACIÓN, Y NO POR PEREZA
// El documento de arquitectura daba por hecho que la Fase 4 necesitaría tablas
// nuevas. No las necesita: `audit_log` es genérico desde 0009 (`action`,
// `object`, `meta jsonb`, append-only) y `coach_proposals` ya guarda `origen`,
// `tipo`, `status` y `resolved_at` desde 0062. Añadir una tabla para lo que dos
// tablas existentes ya registran habría sido crear el segundo sitio donde
// buscar la misma respuesta.
//
// NUNCA LANZA. Anotar es contabilidad, no el trabajo: que falle no puede
// llevarse por delante el mensaje de la mañana de nadie.

import type { AgentEvent, AgentId } from "@/lib/domain/agents/types.ts";
import type { DecisionTomada } from "@/lib/domain/agents/aprendizaje.ts";
import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

/** `coach_proposals.origen` → qué agente del Kernel lo produjo. */
const AGENTE_POR_ORIGEN: Record<string, AgentId> = {
  coach: "coach-diario"
};

/**
 * Los estados de `recommendations` que SON una decisión de la persona.
 *
 * `Presented` queda fuera: es una decisión que todavía no ha ocurrido. Es más
 * fino que `REJECTION_STATUSES` de `domain/insights/states.ts`, que solo
 * distingue lo que realimenta el prompt; aquí hace falta el reparto completo
 * entre aceptar y rechazar.
 */
const ACEPTA = ["Accepted", "Applied", "Edited"] as const;
const RECHAZA = ["Dismissed", "Suppressed", "Reported"] as const;
const DECIDIDOS: string[] = [...ACEPTA, ...RECHAZA];

/**
 * Deja constancia de que un agente pudo hablar y no lo hizo.
 *
 * `object` lleva el id del agente y no el motivo: es lo que se agrupa al contar.
 * El motivo va en `meta`, donde se lee de a uno cuando algo no cuadra.
 */
export async function anotarSilencio(
  supabase: Db,
  entrada: { userId: string; agenteId: AgentId; evento: AgentEvent; motivo: string }
): Promise<void> {
  try {
    await supabase.from("audit_log").insert({
      user_id: entrada.userId,
      action: "agente.silencio",
      object: entrada.agenteId,
      meta: { disparo: entrada.evento.tipo, motivo: entrada.motivo }
    });
  } catch {
    // Un silencio sin anotar es peor contabilidad, no un fallo del producto.
  }
}

/**
 * Lo que la persona ya decidió sobre las propuestas que se le hicieron.
 *
 * Solo `accepted` y `dismissed`: `pending` es una decisión que aún no ha
 * ocurrido, y `aplicando`/`fallida` son estados de la máquina, no de la persona.
 * Contar una propuesta pendiente como rechazo convertiría «no ha abierto la app»
 * en «no le interesa», que es exactamente la inferencia que no queremos hacer.
 *
 * Devuelve lista vacía ante cualquier error: sin datos, `aprendizaje.ts` no
 * afirma nada, que es el defecto correcto.
 */
export async function leerDecisiones(supabase: Db, userId: string): Promise<DecisionTomada[]> {
  try {
    const { data, error } = await supabase
      .from("coach_proposals")
      .select("origen, tipo, status, resolved_at")
      .eq("user_id", userId)
      .in("status", ["accepted", "dismissed"])
      .not("resolved_at", "is", null)
      .order("resolved_at", { ascending: false })
      .limit(500);

    if (error || !data) return [];

    return data.flatMap((fila): DecisionTomada[] => {
      const agenteId = AGENTE_POR_ORIGEN[fila.origen ?? ""];
      // Un origen sin agente registrado —«chat», «centro»— no es un error: es
      // una propuesta que no hizo el Kernel, y contarla le atribuiría a un
      // agente decisiones que no provocó.
      if (!agenteId || !fila.resolved_at) return [];
      return [
        {
          agenteId,
          tipo: fila.tipo,
          status: fila.status === "accepted" ? "accepted" : "dismissed",
          decididaEl: fila.resolved_at.slice(0, 10)
        }
      ];
    });
  } catch {
    return [];
  }
}

/**
 * Lo que la persona decidió sobre las RECOMENDACIONES del análisis nocturno.
 *
 * Vive en otra tabla y con otra máquina de estados que las propuestas del
 * coach, así que hace falta esta segunda lectura. Sin ella, `enRechazoSostenido`
 * —que compara un agente contra los demás— seguiría siendo inerte por mucho que
 * existiera un segundo agente: no habría decisiones suyas con las que comparar.
 *
 * **La fecha es `created_at`, no la de la decisión**, porque `recommendations`
 * no tiene `resolved_at` (0008). Agrupa por el día en que se PROPUSO, no por
 * aquel en que se resolvió. Para `minDias` —contar días distintos con
 * actividad— la diferencia es inocua; si algún día se quiere medir cuánto tarda
 * alguien en decidir, hará falta una columna y una migración.
 */
export async function leerDecisionesDeInsights(supabase: Db, userId: string): Promise<DecisionTomada[]> {
  try {
    const { data, error } = await supabase
      .from("recommendations")
      .select("type, status, created_at")
      .eq("user_id", userId)
      // El filtro va en la CONSULTA y no después, porque `limit` se aplica
      // antes: con el filtro en JS, alguien con quinientas recomendaciones sin
      // abrir se quedaba sin una sola decisión que aprender. Lo encontró una
      // sonda contra la base local, no la lectura del código.
      .in("status", DECIDIDOS)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error || !data) return [];

    return data.flatMap((fila): DecisionTomada[] => {
      const acepta = (ACEPTA as readonly string[]).includes(fila.status);
      // Cinturón, por si la consulta y esta lista se separan algún día.
      if (!acepta && !(RECHAZA as readonly string[]).includes(fila.status)) return [];
      return [
        {
          agenteId: "insights-nocturno",
          tipo: fila.type,
          status: acepta ? "accepted" : "dismissed",
          decididaEl: fila.created_at.slice(0, 10)
        }
      ];
    });
  } catch {
    return [];
  }
}

/**
 * Todo lo que la persona ha decidido, de todos los agentes, en una sola lista.
 *
 * Es lo que `enRechazoSostenido` necesita para poder comparar: un agente solo
 * «se acepta poco» en relación con lo que sí se acepta.
 */
export async function leerTodasLasDecisiones(supabase: Db, userId: string): Promise<DecisionTomada[]> {
  const [propuestas, recomendaciones] = await Promise.all([
    leerDecisiones(supabase, userId),
    leerDecisionesDeInsights(supabase, userId)
  ]);
  return [...propuestas, ...recomendaciones];
}

/**
 * Cuándo cambió por última vez en quién quiere convertirse.
 *
 * Es el corte de `aprendizaje.ts`: lo decidido antes no cuenta. La tabla la
 * llena un trigger desde la migración 0064, así que esto no inventa el evento
 * `identidad.revisada` — solo lo lee.
 */
export async function ultimaRevisionDeIdentidad(supabase: Db, userId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("identity_revisions")
      .select("changed_at")
      .eq("user_id", userId)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.changed_at ? data.changed_at.slice(0, 10) : null;
  } catch {
    return null;
  }
}
