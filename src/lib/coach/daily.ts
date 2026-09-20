import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { crearCajaDeHerramientas } from "@/lib/ai/tools";
import { loadFacts } from "@/lib/insights/facts-loader";
import { allowedDomains, buildContext, MAX_FACTS_COACH } from "@/lib/insights/context";
import { loadChainFacts } from "@/lib/insights/graph-context";
import { sanearPropuestas } from "@/lib/domain/coach/proposals.ts";
import { claveDelCoach, type Momento } from "@/lib/domain/coach/schedule.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";
import type { MemoryItemLike, MemoryScope } from "@/lib/domain/insights/memory.ts";
import { generarMensajeCoach, type CoachResult } from "./generar";
import { overridesDelCoach } from "./facts";
import { coachPorElKernel } from "@/config/env";
import { obtenerAgente, ejecutarAgente } from "@/lib/agents/runtime";
import { COACH_METADATOS } from "@/lib/domain/agents/coach.ts";
import { convieneActuar } from "@/lib/domain/agents/politicas.ts";
import { acotarContexto } from "@/lib/domain/agents/contexto.ts";
import type { AgentEvent } from "@/lib/domain/agents/types.ts";
import { anotarSilencio, leerDecisiones, ultimaRevisionDeIdentidad } from "@/lib/agents/bitacora";
import { enRechazoSostenido } from "@/lib/domain/agents/aprendizaje.ts";
import type { CajaDeHerramientas } from "@/lib/domain/ai/tools.ts";
import type { InsightContext } from "@/lib/insights/context";
import { esSalidaCoach } from "@/lib/agents/coach-diario";

/** Un `CoachResult` que no dijo nada, para no repetir la forma en cada salida. */
const VACIO_COACH: CoachResult = { ok: false, resumen: "", mensaje: "", propuestas: [], factIds: [] };

/**
 * UN MENSAJE DIARIO, DE PRINCIPIO A FIN.
 *
 * Lo llama el despachador (`/api/push/dispatch`), que corre SIN SESIÓN. De ahí
 * salen las tres cosas que hacen a este archivo distinto de `ai-chat/actions.ts`,
 * que hace lo mismo pero para una pregunta:
 *
 *  1. **Cliente de servicio.** Ver `coach/facts.ts`: la RLS no está puesta en
 *     este camino, así que todo filtra por `user_id` a mano.
 *  2. **Sin la herramienta `consultar`.** El modelo no arma consultas aquí. Con
 *     la RLS fuera, una consulta que el modelo compone no se puede garantizar.
 *     Razona sobre hechos ya calculados; el chat conserva el acceso a las filas
 *     porque allí sí hay sesión.
 *  3. **Nadie está mirando.** Nunca lanza y nunca escribe a medias: primero se
 *     guarda el turno, y solo si eso sale bien se guardan las propuestas y se
 *     avisa. Una propuesta huérfana sería un botón sin la observación que lo
 *     explica.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface MensajeCoach {
  ok: boolean;
  /** El id del turno guardado en `ai_chat_messages`. */
  messageId?: string;
  resumen?: string;
  propuestas?: number;
  reason?: string;
  /**
   * Los dominios autorizados que se usaron para este mensaje. El despachador
   * los necesita para `proponerAristas` sin tener que volver a leer
   * `profiles.ai_domains` ni ampliar por su cuenta lo que está autorizado.
   */
  domains?: Domain[];
}

export interface EntradaCoach {
  supabase: Admin;
  userId: string;
  momento: Momento;
  /** "Hoy" en la zona del usuario. */
  today: string;
}

/**
 * El mismo mensaje, pero decidido por el Kernel (D-173).
 *
 * LO QUE CAMBIA Y LO QUE NO. Todo lo de antes —perfil, opt-in, hechos, cadenas,
 * `buildContext`, la caja sin `consultar`— es exactamente el mismo código, y
 * todo lo de después —guardar el turno, las propuestas, el rastro— también. Lo
 * único que se sustituye son cuatro líneas en medio: quién decide que hay que
 * hablar, y quién llama al modelo.
 *
 * Es deliberado que la comparación sea así de estrecha. Si el Kernel construyera
 * su propio contexto, una diferencia en el mensaje no diría si el Kernel piensa
 * distinto o si mira datos distintos, y no habría forma de saberlo sin repetir
 * la llamada. Con el contexto compartido, cualquier diferencia es del Kernel.
 *
 * El restraint SÍ manda aquí, y es la novedad visible: el Kernel puede decidir
 * que hoy no toca hablar y devolver un `ok: false` con el motivo. El camino
 * viejo no sabía callarse —`claveDelCoach` evitaba repetir, pero no evitaba
 * decir algo—; éste sí, y por eso el motivo acaba en `audit_log` como cualquier
 * otro fallo en vez de perderse.
 */
async function pensarPorElKernel(input: {
  supabase: Admin;
  context: InsightContext;
  caja: CajaDeHerramientas;
  momento: Momento;
  today: string;
  userId: string;
}): Promise<CoachResult> {
  const agente = obtenerAgente(COACH_METADATOS.id);
  if (!agente) {
    // Con `problemasDeArranque()` no vacío. No se improvisa un coach: se dice.
    return { ...VACIO_COACH, reason: "El Kernel no tiene registrado al coach diario." };
  }

  const evento: AgentEvent = {
    tipo: input.momento === "morning" ? "cron.manana" : "cron.noche",
    userId: input.userId,
    ocurridoEn: new Date().toISOString()
  };

  // Lo que la persona ha hecho con lo que se le propuso (D-174), acotado a
  // partir de su última revisión de identidad: lo decidido por quien ya no
  // quiere ser no cuenta. Si algo falla, las dos lecturas devuelven vacío y el
  // agente actúa como siempre — callar por falta de datos sería castigarlo por
  // ser nuevo.
  const [decisiones, desdeLaRevision] = await Promise.all([
    leerDecisiones(input.supabase, input.userId),
    ultimaRevisionDeIdentidad(input.supabase, input.userId)
  ]);

  // La primera vez del día: `vecesEnLaFranja` en 0 porque quien llama a este
  // archivo ya aplicó el dedupe de `claveDelCoach` antes de entrar. Contarlo
  // otra vez aquí sería el mismo filtro dos veces con dos relojes distintos.
  const veredicto = convieneActuar(agente, evento, {
    vecesEnLaFranja: 0,
    yaActuaron: [],
    descartadoHoy: false,
    rechazoSostenido: enRechazoSostenido(decisiones, agente.id, { desdeLaRevision })
  });
  if (!veredicto.actuar) {
    // El silencio deja rastro, o no se distingue de un fallo. Es la métrica
    // declarada del Kernel: que esta proporción suba con el tiempo.
    await anotarSilencio(input.supabase, {
      userId: input.userId,
      agenteId: agente.id,
      evento,
      motivo: veredicto.motivo
    });
    return { ...VACIO_COACH, reason: veredicto.motivo };
  }

  const acotado = acotarContexto(
    agente,
    {
      userId: input.userId,
      today: input.today,
      timeZone: "UTC", // el coach ya recibe `today` resuelto; no vuelve a calcular fechas
      domains: input.context.domains,
      facts: input.context.facts,
      memory: input.context.memory,
      rejections: input.context.rejections,
      herramientas: input.caja
    },
    evento
  );
  if (!acotado.ok) return { ...VACIO_COACH, reason: acotado.reason };

  const salida = await ejecutarAgente(agente.id, acotado.entrada);
  if (!salida.ok) return { ...VACIO_COACH, reason: salida.reason };

  if (!esSalidaCoach(salida.datos)) {
    return { ...VACIO_COACH, reason: "El coach del Kernel devolvió algo que no es un mensaje." };
  }

  const { resumen, mensaje, propuestas, factIds } = salida.datos;
  return { ok: true, resumen, mensaje, propuestas, factIds };
}

export async function generarYGuardarMensajeDiario(entrada: EntradaCoach): Promise<MensajeCoach> {
  const { supabase, userId, momento, today } = entrada;

  const [{ data: profile }, { data: memory }, overrides] = await Promise.all([
    supabase
      .from("profiles")
      .select("quincenal_income, ai_domains, activity_window_start, activity_window_end")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("memory_items").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    overridesDelCoach(supabase, userId)
  ]);

  // El opt-in por dominio manda igual que en el chat. Si el usuario lo apagó
  // todo no se le manda un mensaje vacío: no se le manda ninguno. Un coach que
  // dice «no sé nada de ti» cada mañana es peor que uno callado.
  const enabledDomains = (profile?.ai_domains ?? []) as Domain[];
  const permitidos = allowedDomains("global").filter((d) => enabledDomains.includes(d));
  if (!permitidos.length) return { ok: false, reason: "El usuario no autorizó ningún dominio." };

  const perfil = {
    quincenalIncome: profile?.quincenal_income ?? 0,
    window: {
      start: (profile?.activity_window_start ?? "08:00").slice(0, 5),
      end: (profile?.activity_window_end ?? "18:00").slice(0, 5)
    }
  };

  const facts = await loadFacts(supabase, userId, permitidos, today, perfil, overrides);

  // Sin sesión: la variante `_de`, que solo el cliente de servicio puede llamar.
  facts.push(...(await loadChainFacts(supabase, facts, permitidos, { modo: "servicio", userId })));

  const context = buildContext({
    scope: "global",
    facts,
    enabledDomains,
    todayISO: today,
    // Más hechos que en el chat: el coach tiene que mirar la vida entera antes
    // de elegir las tres cosas que merecen decirse hoy.
    maxFacts: MAX_FACTS_COACH,
    memory: (memory ?? []).map(
      (m): MemoryItemLike => ({
        id: m.id,
        scope: m.scope as MemoryScope,
        origin: m.origin as MemoryItemLike["origin"],
        text: m.text,
        validUntil: m.valid_until
      })
    )
  });

  // La caja SIN `consultar`: ver el punto 2 de la cabecera. `leer_hechos` sí,
  // porque los dominios que pide ya vienen intersecados con lo autorizado y las
  // consultas de dentro son las de `loadFacts`, con sus filtros explícitos.
  const caja = crearCajaDeHerramientas({
    supabase,
    userId,
    autorizados: permitidos,
    today,
    profile: perfil,
    sinConsultarFilas: true,
    overrides
  });

  const result = coachPorElKernel()
    ? await pensarPorElKernel({ supabase, context, caja, momento, today, userId })
    : await generarMensajeCoach({ context, tools: caja, momento, today });
  if (!result.ok) return { ok: false, reason: result.reason };

  const { data: guardado, error } = await supabase
    .from("ai_chat_messages")
    .insert({ user_id: userId, role: "assistant", content: result.mensaje, fact_ids: result.factIds })
    .select("id")
    .single();
  if (error || !guardado) return { ok: false, reason: error?.message ?? "No se pudo guardar el mensaje." };

  const propuestas = sanearPropuestas(result.propuestas);
  if (propuestas.length) {
    await supabase.from("coach_proposals").insert(
      propuestas.map((p) => ({
        user_id: userId,
        message_id: guardado.id,
        tipo: p.tipo,
        titulo: p.titulo,
        detalle: p.detalle,
        payload: p.payload
      }))
    );
  }

  // El rastro, con lo mismo que registra un turno de chat más el momento. Sin
  // él, «el coach no me escribió» y «el coach escribió y el push no salió» se
  // ven igual desde fuera.
  //
  // Las sugerencias de arista del grafo YA NO se cuentan aquí (F1): esa
  // segunda llamada al modelo se movió al despachador, DESPUÉS de que
  // `notifySystem` deje escrito el dedupe de este mensaje. Si se hiciera
  // aquí, un platform kill a mitad de esa llamada haría que el siguiente tick
  // de cinco minutos regenerase y volviera a mandar el mensaje entero.
  await supabase.from("audit_log").insert({
    user_id: userId,
    action: "ai.coach",
    object: momento,
    meta: {
      domains: context.domains,
      facts: context.facts.length,
      propuestas: propuestas.length,
      busquedas: caja.busquedas(),
      dedupeKey: claveDelCoach(momento, today)
    }
  });

  return { ok: true, messageId: guardado.id, resumen: result.resumen, propuestas: propuestas.length, domains: permitidos };
}
