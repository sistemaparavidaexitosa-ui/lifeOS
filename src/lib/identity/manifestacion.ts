// src/lib/identity/manifestacion.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { manifestationAgentTimeoutMs, manifestationAgentUrl, requireManifestationAgentSecret } from "@/config/env";
import type { SourceSnapshot } from "@/lib/domain/development/goals.ts";
import { sanearBrief, LIMITES_AGENTE } from "@/lib/domain/identity/brief.ts";
import { firmarToken } from "@/lib/domain/identity/token.ts";
import { decidirPorEstado, decidirPorExcepcion, hayAgente, type MotivoRespaldo } from "@/lib/domain/identity/respaldo.ts";
import { AgentResponseSchema } from "@/lib/domain/identity/payload.ts";
import { loadContextoDelBrief, DOMINIOS_DEL_BRIEF, type ContextoDelBrief } from "./agent-context";
import { generarBrief } from "./generar";
import type { BriefProducido } from "./guardar-brief";

/**
 * EL ÚNICO SITIO QUE DECIDE QUIÉN ESCRIBE EL BRIEF (D-164).
 *
 * Primero el agente Python; si no contesta, el respaldo en TypeScript. Nadie
 * más hace esta elección: si la hicieran dos sitios, acabarían discrepando en
 * qué cuenta como «no contestó» y el mismo fallo daría resultados distintos
 * según por dónde entrara.
 *
 * EL CONTEXTO SE CARGA EN PARALELO A LA LLAMADA, y merece explicación porque
 * parece trabajo duplicado: el agente pide su propio contexto al endpoint, así
 * que en el camino feliz se reúne dos veces. Es el coste de la topología
 * elegida —el agente vive fuera y no toca la base—, y se paga en consultas, no
 * en espera: esta carga son diez consultas en paralelo contra los cinco a
 * quince segundos del modelo. Cargarlo DESPUÉS de la respuesta sí se notaría.
 *
 * Y hace falta de todas formas, pase lo que pase: si el agente contesta, para
 * comprobar que los rasgos y hechos que cita existen de verdad; si no contesta,
 * porque es lo que el respaldo necesita para escribir.
 */

type Db = SupabaseClient<Database>;

export type { MotivoRespaldo };

export type ResultadoManifestacion =
  | { ok: true; producido: BriefProducido; contexto: ContextoDelBrief }
  | { ok: false; reason: string };

interface RespuestaAgente {
  ok: boolean;
  datos?: import("@/lib/domain/identity/payload.ts").AgentResponse;
  motivo?: MotivoRespaldo;
  /** El mensaje del agente cuando el problema es de la persona, no del agente. */
  reasonDelUsuario?: string;
  ms: number;
}

/**
 * Llama al agente. NUNCA LANZA (D-021).
 *
 * Un solo intento, y es deliberado: un segundo intento de veinte segundos hace
 * que la espera total sea peor que el respaldo, que es justo lo que el respaldo
 * evita. Tampoco hay circuit breaker — en serverless no hay estado entre
 * invocaciones que lo sostenga, y uno fingido con una variable de módulo
 * mentiría en cuanto hubiera dos instancias.
 */
async function llamarAlAgente(userId: string, today: string, timeZone: string): Promise<RespuestaAgente> {
  const inicio = Date.now();
  const url = manifestationAgentUrl();

  let secreto: string | null = null;
  try {
    secreto = requireManifestationAgentSecret();
  } catch {
    secreto = null;
  }

  // El porqué de tratar «media configuración» como «sin agente» está en
  // `hayAgente`, junto a su test.
  if (!hayAgente(url, secreto) || !url || !secreto) return { ok: false, motivo: "sin-configurar", ms: 0 };

  let respuesta: Response;
  try {
    respuesta = await fetch(`${url}/manifestation/daily`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-secret": secreto },
      signal: AbortSignal.timeout(manifestationAgentTimeoutMs()),
      body: JSON.stringify({
        userId,
        localDate: today,
        timeZone,
        // El token viaja de ida para que el agente lo devuelva con el contexto
        // que pida: es lo que ata su lectura a ESTA petición.
        token: firmarToken(secreto, { userId, localDate: today })
      })
    });
  } catch (error) {
    const decision = decidirPorExcepcion(error);
    return { ok: false, motivo: decision.respaldo ? decision.motivo : "red", ms: Date.now() - inicio };
  }

  const ms = Date.now() - inicio;

  if (!respuesta.ok) {
    const decision = decidirPorEstado(respuesta.status);
    if (!decision.respaldo) {
      // El agente dice que esto no es cosa suya (falta identidad declarada, o
      // la IA está apagada). Su mensaje viene en español y es para la persona.
      const cuerpo = (await respuesta.json().catch(() => null)) as { reason?: string } | null;
      return { ok: false, reasonDelUsuario: cuerpo?.reason ?? "Primero di en quién te estás convirtiendo.", ms };
    }
    return { ok: false, motivo: decision.motivo, ms };
  }

  const crudo = await respuesta.json().catch(() => null);
  const parsed = AgentResponseSchema.safeParse(crudo);
  if (!parsed.success) return { ok: false, motivo: "payload-invalido", ms };

  return { ok: true, datos: parsed.data, ms };
}

/**
 * El brief de hoy, venga de donde venga. No guarda nada: eso lo hace
 * `guardarBrief`, que es el único escritor.
 */
export async function generarManifestacion(opts: {
  supabase: Db;
  userId: string;
  today: string;
  timeZone: string;
  sources: SourceSnapshot;
  /** «sesion» cuando lo pide la persona; «servicio» cuando lo escribe el reloj. */
  modo?: "sesion" | "servicio";
}): Promise<ResultadoManifestacion> {
  const { supabase, userId, today, timeZone, sources, modo = "sesion" } = opts;

  const [cargado, delAgente] = await Promise.all([
    loadContextoDelBrief({ supabase, userId, today, timeZone, sources, modo }),
    llamarAlAgente(userId, today, timeZone)
  ]);

  // Lo que diga el contexto manda sobre lo que diga el agente: si aquí no hay
  // identidad declarada o la IA está apagada, no hay brief que escribir y el
  // motivo es para la persona, no para el registro técnico.
  if (!cargado.ok) return { ok: false, reason: cargado.reason };
  const contexto = cargado.contexto;

  if (!delAgente.ok && delAgente.reasonDelUsuario) {
    return { ok: false, reason: delAgente.reasonDelUsuario };
  }

  const base = {
    tono: contexto.preferencias.tono,
    facts: contexto.factCount,
    domains: DOMINIOS_DEL_BRIEF
  };

  if (delAgente.ok && delAgente.datos) {
    const saneado = sanearBrief(delAgente.datos.payload, contexto.saneado, LIMITES_AGENTE);
    if (saneado.ok && saneado.brief) {
      return {
        ok: true,
        contexto,
        producido: {
          ok: true,
          brief: saneado.brief,
          generator: "py",
          tono: base.tono,
          model: delAgente.datos.model,
          agentVersion: delAgente.datos.agentVersion,
          meta: {
            fuente: "py",
            motivoRespaldo: null,
            latenciaMs: delAgente.ms,
            model: delAgente.datos.model,
            agentVersion: delAgente.datos.agentVersion,
            promptVersion: delAgente.datos.promptVersion,
            facts: base.facts,
            domains: base.domains,
            // Los problemas que el saneado corrigió sin llegar a tumbar el
            // brief. Son la señal temprana de un prompt del agente que se está
            // desviando, y sin registrarlos solo se verían como briefs
            // ligeramente peores.
            saneados: saneado.problemas.length
          }
        }
      };
    }
    delAgente.motivo = "no-paso-el-saneado";
  }

  // --- EL RESPALDO ---------------------------------------------------------
  // Se le pasa el contexto ya cargado para que no repita las diez consultas.
  const generado = await generarBrief({ supabase, userId, today, timeZone, sources, contexto });

  return {
    ok: true,
    contexto,
    producido: {
      ok: generado.ok,
      brief: generado.brief,
      reason: generado.reason,
      generator: "ts",
      tono: base.tono,
      model: generado.model,
      agentVersion: "",
      meta: {
        fuente: "ts",
        motivoRespaldo: delAgente.motivo ?? "sin-configurar",
        latenciaMs: delAgente.ms,
        model: generado.model ?? null,
        facts: generado.factCount ?? base.facts,
        intentos: generado.intentos ?? 0,
        domains: base.domains
      }
    }
  };
}

export type EstadoDelAgente = "despierto" | "durmiendo" | "sin-agente";

/**
 * ¿Está el agente en pie?
 *
 * EXISTE POR UN MOTIVO MUY CONCRETO: los servicios gestionados baratos apagan el
 * contenedor tras unos minutos sin tráfico y tardan cerca de un MINUTO en
 * volver. El presupuesto que le da esta app son veinte segundos, pensados para
 * alguien que espera mirando un botón. Las dos cifras son incompatibles, y
 * subir el plazo no es la solución: nadie mira un botón durante un minuto.
 *
 * La solución es no pedirle nada a un agente dormido. El reloj de la madrugada
 * llama primero a `/health` —que es barato y no pide secreto— y solo genera si
 * contesta. Si no contesta, la propia llamada ya empezó a despertarlo y la
 * siguiente pasada, cinco minutos después, lo encontrará listo. La hora entera
 * da doce oportunidades.
 *
 * NUNCA LANZA. «No sé» y «está dormido» se tratan igual, porque la acción es la
 * misma: esperar a la siguiente pasada.
 */
export async function despertarAgente(timeoutMs = 5_000): Promise<EstadoDelAgente> {
  const url = manifestationAgentUrl();
  // Sin agente NO es un problema: significa que escribirá el respaldo, que no
  // se duerme ni tarda en arrancar. Se puede generar ya.
  if (!url) return "sin-agente";

  try {
    const respuesta = await fetch(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return respuesta.ok ? "despierto" : "durmiendo";
  } catch {
    return "durmiendo";
  }
}
