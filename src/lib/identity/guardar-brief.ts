// src/lib/identity/guardar-brief.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { actionFailed } from "@/lib/supabase/errors";
import { etiquetarEstilo, type Tono } from "@/lib/domain/identity/estilo.ts";
import type { Brief } from "@/lib/domain/identity/brief.ts";
import { PROMPT_VERSION } from "./prompt";
import { briefDeFila, filaDeBrief, type BriefView } from "./brief-view";

/**
 * EL ÚNICO SITIO QUE ESCRIBE UN BRIEF.
 *
 * Lo llaman la Server Action (cuando la persona pulsa el botón) y, si algún día
 * el agente pasa a escribir de forma asíncrona, el Route Handler. Que sea uno y
 * no dos no es estética: el tope de tres generaciones al día se cuenta en
 * `audit_log`, y un segundo camino de guardado que no auditara sería una fuga
 * silenciosa del tope —y de los costes que el tope protege—.
 *
 * Hace tres escrituras, en este orden y por este motivo:
 *   1. `audit_log` SIEMPRE, incluso si la generación falló. Un intento fallido
 *      gastó cuota igual, y si no contara, un fallo en bucle esquivaría el tope.
 *   2. `identity_briefs`, solo si hay brief.
 *   3. `identity_brief_style` con las etiquetas de estilo — la mitad de arriba
 *      del experimento. La de abajo la escribe el reloj mañana por la noche.
 */

type Db = SupabaseClient<Database>;

/**
 * Generaciones por persona y día, contando la primera. Es un tope de coste:
 * cada una es una o dos llamadas al modelo. Se cuenta en `audit_log` y no en
 * la fila del brief, porque la fila la puede borrar la persona («borrar
 * historial de IA») y el registro de auditoría no.
 */
export const MAX_GENERACIONES = 3;

/** La acción bajo la que se cuenta el tope. No cambiarla: es la clave del conteo. */
const ACCION_AUDITADA = "ai.identity_brief";

export async function generacionesDeHoy(supabase: Db, userId: string, today: string): Promise<number> {
  const { count } = await supabase
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", ACCION_AUDITADA)
    .eq("object", today);
  return count ?? 0;
}

/** Lo que produjo cualquiera de los dos generadores, listo para guardarse. */
export interface BriefProducido {
  ok: boolean;
  brief?: Brief;
  reason?: string;
  model?: string;
  agentVersion?: string;
  /** Quién lo escribió. Acaba en la columna `generator` y en la auditoría. */
  generator: "ts" | "py";
  /** El tono vigente cuando se escribió: es una de las etiquetas de estilo. */
  tono: Tono;
  /** Lo que se guarda en `audit_log.meta`, sin textos del brief. */
  meta: Record<string, unknown>;
}

export type ResultadoGuardado = { ok: true; brief: BriefView } | { ok: false; reason: string };

export async function guardarBrief(opts: {
  supabase: Db;
  userId: string;
  today: string;
  producido: BriefProducido;
  /** Intentos ya hechos hoy, para numerar la generación. */
  hechas: number;
  reemplaza: boolean;
}): Promise<ResultadoGuardado> {
  const { supabase, userId, today, producido, hechas, reemplaza } = opts;

  await supabase.from("audit_log").insert({
    user_id: userId,
    action: ACCION_AUDITADA,
    object: today,
    meta: { ...producido.meta, generator: producido.generator, ok: producido.ok, reemplaza }
  });

  if (!producido.ok || !producido.brief) {
    return { ok: false, reason: producido.reason ?? "No se pudo generar el brief." };
  }

  if (reemplaza) {
    // Borrar el brief se lleva por delante su fila de estilo (cascade de 0067),
    // que es lo correcto: las etiquetas describían un brief que ya no existe.
    const { error } = await supabase.from("identity_briefs").delete().eq("user_id", userId).eq("local_date", today);
    if (error) return actionFailed(error) as ResultadoGuardado;
  }

  const { data, error } = await supabase
    .from("identity_briefs")
    .insert({
      user_id: userId,
      local_date: today,
      ...filaDeBrief(producido.brief),
      model: producido.model ?? "",
      generator: producido.generator,
      agent_version: producido.agentVersion ?? "",
      prompt_version: PROMPT_VERSION,
      generation: Math.min(MAX_GENERACIONES, hechas + 1)
    })
    .select("*")
    .single();

  if (error || !data) {
    // Dos pestañas generando a la vez: la otra ganó la carrera por la clave
    // única. Se devuelve la suya en vez de un error.
    if (error?.code === "23505") {
      const { data: ganadora } = await supabase.from("identity_briefs").select("*").eq("user_id", userId).eq("local_date", today).maybeSingle();
      if (ganadora) return { ok: true, brief: briefDeFila(ganadora) };
    }
    return actionFailed(error) as ResultadoGuardado;
  }

  // Las etiquetas de estilo. Si esto falla, el brief sigue guardado y lo único
  // que se pierde es un día de aprendizaje: no vale la pena tumbar la mañana de
  // alguien por una fila de telemetría, así que el error se traga a propósito.
  const etiquetas = etiquetarEstilo(producido.brief, { tono: producido.tono });
  await supabase.from("identity_brief_style").insert({
    brief_id: data.id,
    user_id: userId,
    local_date: today,
    tone: etiquetas.tone,
    length_bucket: etiquetas.lengthBucket,
    scene_kind: etiquetas.sceneKind,
    uses_numbers: etiquetas.usesNumbers,
    category_mix: etiquetas.categoryMix,
    affirmation_count: etiquetas.affirmationCount
  });

  return { ok: true, brief: briefDeFila(data) };
}
