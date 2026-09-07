import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { crearCajaDeHerramientas } from "@/lib/ai/tools";
import { loadFacts } from "@/lib/insights/facts-loader";
import { allowedDomains, buildContext, MAX_FACTS_COACH } from "@/lib/insights/context";
import { sanearPropuestas } from "@/lib/domain/coach/proposals.ts";
import { claveDelCoach, type Momento } from "@/lib/domain/coach/schedule.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";
import type { MemoryItemLike, MemoryScope } from "@/lib/domain/insights/memory.ts";
import { generarMensajeCoach } from "./generar";
import { overridesDelCoach } from "./facts";

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
}

export interface EntradaCoach {
  supabase: Admin;
  userId: string;
  momento: Momento;
  /** "Hoy" en la zona del usuario. */
  today: string;
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

  const result = await generarMensajeCoach({ context, tools: caja, momento, today });
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

  return { ok: true, messageId: guardado.id, resumen: result.resumen, propuestas: propuestas.length };
}
