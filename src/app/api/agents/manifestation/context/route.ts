import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { comprobarSecretoDelAgente } from "@/lib/identity/agent-auth";
import { loadContextoDelBrief } from "@/lib/identity/agent-context";
import { VOCABULARIO, MAX_AFIRMACIONES, MAX_PASOS } from "@/lib/domain/identity/payload.ts";
import { LIMITES_AGENTE } from "@/lib/domain/identity/brief.ts";
import { preferenciasParaElPrompt } from "@/lib/domain/identity/estilo.ts";
import { firmarToken } from "@/lib/domain/identity/token.ts";
import { fuentesDe } from "@/lib/coach/facts";
import { todayInTimeZone, DEFAULT_TIMEZONE, isValidTimeZone } from "@/lib/domain/datetime.ts";

export const dynamic = "force-dynamic";
/** Una docena de consultas en paralelo. Con treinta segundos sobra de largo. */
export const maxDuration = 30;

/**
 * EL CONTEXTO QUE EL AGENTE NECESITA PARA ESCRIBIR EL BRIEF (D-164).
 *
 * Reúne lo mismo —exactamente lo mismo— que ve el respaldo, porque usa la misma
 * función. No es reutilización por ahorro: si esta ruta montara el contexto por
 * su cuenta, el agente y el respaldo escribirían a partir de datos distintos y
 * el libro de estilo estaría comparando días contra dos líneas base sin que
 * nada lo delatara.
 *
 * ES POST Y NO GET a propósito. Un GET llevaría el `user_id` en la URL, y las
 * URL acaban en registros de acceso, en cachés intermedias y en el historial de
 * cualquier proxy. El cuerpo no.
 *
 * TRES COSAS QUE PASAN AQUÍ Y SON FÁCILES DE OLVIDAR:
 *   1. Se respeta `ai_domains`. La comprobación vive dentro de
 *      `loadContextoDelBrief`, que es lo que impide que esta puerta nueva sea
 *      una puerta trasera al opt-in de la persona.
 *   2. Se AUDITA la lectura, visible para la persona.
 *   3. Hay tope diario en `ai_job_runs`, para que un agente en bucle no lea
 *      dos mil veces la misma vida.
 */

const CONTEXT_VERSION = 1;

/** Lecturas de contexto por persona y día. Generoso, pero no infinito. */
const MAX_LECTURAS = 30;

const cuerpoSchema = z.object({
  userId: z.string().uuid(),
  localDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
});

export async function POST(request: Request) {
  const guardia = comprobarSecretoDelAgente(request);
  if (!guardia.ok) return guardia.respuesta;

  const parsed = cuerpoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "Petición mal formada." }, { status: 400 });
  const { userId } = parsed.data;

  const supabase = createAdminClient();

  // Sin sesión no hay `auth.uid()`: la zona horaria se busca a mano, y a partir
  // de aquí TODA consulta filtra `user_id` explícitamente (el cliente de
  // servicio se salta la RLS).
  const { data: perfil } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
  if (!perfil) return NextResponse.json({ ok: false, reason: "No existe esa persona." }, { status: 404 });

  const timeZone = perfil.timezone && isValidTimeZone(perfil.timezone) ? perfil.timezone : DEFAULT_TIMEZONE;
  const today = parsed.data.localDate ?? todayInTimeZone(timeZone);

  // El tope se cuenta ANTES de leer nada. `ai_job_runs` tiene la clave primaria
  // por (persona, trabajo, día), así que aquí se cuenta en `audit_log`, que es
  // donde ya vive el conteo de generaciones y donde la persona no puede borrarlo.
  const { count: lecturas } = await supabase
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "ai.agent_context")
    .eq("object", today);
  if ((lecturas ?? 0) >= MAX_LECTURAS) {
    return NextResponse.json({ ok: false, reason: "Demasiadas lecturas de contexto hoy." }, { status: 429 });
  }

  const cargado = await loadContextoDelBrief({
    supabase,
    userId,
    today,
    timeZone,
    sources: await fuentesDe(supabase, userId),
    modo: "servicio"
  });

  if (!cargado.ok) {
    // 409 y no 500: no está roto, es que a esta persona le falta decir quién
    // quiere ser o tiene la IA apagada para estos dominios. El agente lo
    // propaga tal cual y el lado TS sabe NO caer al respaldo con este código,
    // porque el respaldo fallaría exactamente igual.
    return NextResponse.json({ ok: false, reason: cargado.reason }, { status: 409 });
  }

  const { contexto } = cargado;
  const d = contexto.datos;

  await supabase.from("audit_log").insert({
    user_id: userId,
    action: "ai.agent_context",
    object: today,
    meta: { agent: "manifestation", facts: contexto.factCount, traits: d.rasgos.length, contextVersion: CONTEXT_VERSION }
  });

  return NextResponse.json({
    ok: true,
    contextVersion: CONTEXT_VERSION,
    // Ata lo que el agente devuelva a ESTA petición: esta persona y este día.
    token: firmarToken(guardia.secreto, { userId, localDate: today }),
    today,
    timeZone,
    identity: {
      desired: d.identidad.deseada,
      vision: d.identidad.vision,
      values: d.identidad.valores,
      previous: d.revisionAnterior,
      tone: contexto.preferencias.tono,
      inspirations: contexto.preferencias.inspiraciones
    },
    traits: d.rasgos.map((r) => ({ id: r.id, name: r.nombre, statement: r.frase, area: r.area, completion30: r.cumplimiento })),
    goals: d.metas.map((m) => ({ title: m.titulo, area: m.area, progressPct: m.avance })),
    routines: d.rutinas.map((r) => ({ name: r.nombre, identity: r.identidad })),
    facts: d.hechos,
    memory: d.memoria,
    reflections: d.reflexiones.map((r) => ({ date: r.fecha, text: r.texto })),
    previousBriefs: d.previos.map((p) => ({
      date: p.fecha,
      affirmations: p.afirmaciones,
      resonated: p.resonaron,
      notResonated: p.noResonaron,
      mantra: p.mantra ?? null
    })),
    // Las de confianza baja NO viajan: en la pantalla se enseñan como «todavía
    // observando», pero decírselas al modelo sería presentarle una duda como
    // una conclusión.
    stylePreferences: {
      n: contexto.estilo.n,
      enough: contexto.estilo.suficiente,
      note: contexto.estilo.nota,
      preferences: preferenciasParaElPrompt(contexto.estilo)
    },
    identityScore: contexto.identityScore,
    limits: {
      minAffirmations: LIMITES_AGENTE.minAfirmaciones,
      maxAffirmations: MAX_AFIRMACIONES,
      maxSteps: MAX_PASOS,
      visualizationSeconds: { min: LIMITES_AGENTE.minSegundos, max: LIMITES_AGENTE.maxSegundos },
      mantraMaxWords: 20
    },
    vocabulary: VOCABULARIO
  });
}
