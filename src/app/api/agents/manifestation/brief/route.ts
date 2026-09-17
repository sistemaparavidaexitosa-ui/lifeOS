import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { comprobarSecretoDelAgente } from "@/lib/identity/agent-auth";
import { loadContextoDelBrief } from "@/lib/identity/agent-context";
import { ManifestationPayloadSchema, problemasDeForma } from "@/lib/domain/identity/payload.ts";
import { generacionesDeHoy, guardarBrief, MAX_GENERACIONES } from "@/lib/identity/guardar-brief";
import { sanearBrief, LIMITES_AGENTE } from "@/lib/domain/identity/brief.ts";
import { verificarToken } from "@/lib/domain/identity/token.ts";
import { fuentesDe } from "@/lib/coach/facts";
import { DEFAULT_TIMEZONE, isValidTimeZone } from "@/lib/domain/datetime.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * DONDE EL AGENTE DEJA EL BRIEF QUE ESCRIBIÓ.
 *
 * En el camino del botón esta ruta no se usa: allí el agente devuelve el brief
 * en su respuesta y lo guarda la Server Action, que ya tiene la sesión. Existe
 * para el camino asíncrono —un reloj que genere el brief antes de que la
 * persona despierte— y para que un agente cuya respuesta se perdió por la red
 * pueda reintentar sin volver a llamar al modelo.
 *
 * CINCO CAPAS CONTRA UN PAYLOAD BASURA, en este orden y por este motivo:
 *
 *  1. **Tamaño, antes de parsear.** Un JSON de ocho megas no debe llegar ni a
 *     zod.
 *  2. **Forma (zod, `.strict()`).** Falla con 422 y la lista de problemas EN
 *     ESPAÑOL, para que el agente pueda reintentar con la corrección escrita en
 *     vez de a ciegas.
 *  3. **Saneado.** `sanearBrief` es la autoridad (D-164): lo que no pasa, no se
 *     guarda. Que el agente tenga su propia copia de estas reglas le ahorra un
 *     reintento; no protege nada.
 *  4. **Los ids NO se creen: se comprueban.** El contexto se vuelve a cargar y
 *     de ahí salen los conjuntos de rasgos y hechos válidos. Aceptar los que
 *     vengan en el cuerpo dejaría pasar un `trait_id` inventado que rompería la
 *     pantalla al buscar su nombre.
 *  5. **Lo que no es contenido lo decide el servidor.** `local_date` sale del
 *     token, no del cuerpo. `generation` sale del conteo en `audit_log`.
 *     `prompt_version` es la del repo. El agente no puede fijar ninguno.
 */

/** Un brief con veinte afirmaciones y doce pasos cabe de sobra en esto. */
const MAX_BYTES = 64 * 1024;

const cuerpoSchema = z.object({
  token: z.string().min(1).max(512),
  userId: z.string().uuid(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  model: z.string().max(120).default(""),
  agentVersion: z.string().max(40).default(""),
  replace: z.boolean().default(false),
  payload: ManifestationPayloadSchema
});

export async function POST(request: Request) {
  const guardia = comprobarSecretoDelAgente(request);
  if (!guardia.ok) return guardia.respuesta;

  const declarado = Number(request.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > MAX_BYTES) {
    return NextResponse.json({ ok: false, reason: "El brief es demasiado grande." }, { status: 413 });
  }

  const crudo = await request.json().catch(() => null);
  const parsed = cuerpoSchema.safeParse(crudo);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "El brief no tiene la forma esperada.", problemas: problemasDeForma(parsed.error) }, { status: 422 });
  }
  const { token, userId, localDate, model, agentVersion, replace, payload } = parsed.data;

  const verificado = verificarToken(guardia.secreto, token, { userId, localDate });
  if (!verificado.ok) {
    // El motivo exacto no se devuelve: distinguir «caducado» de «firma
    // inválida» le diría a quien prueba llaves cuál de las dos mitades acertó.
    return NextResponse.json({ ok: false, reason: "El token no autoriza esta escritura." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: perfil } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
  if (!perfil) return NextResponse.json({ ok: false, reason: "No existe esa persona." }, { status: 404 });
  const timeZone = perfil.timezone && isValidTimeZone(perfil.timezone) ? perfil.timezone : DEFAULT_TIMEZONE;

  // Idempotencia: si ya hay brief para ese día y no se pidió reemplazar, esto
  // NO es un error. Un reintento de red del agente no debe convertirse en un
  // 409 que alguien tenga que interpretar de madrugada.
  const { data: existente } = await supabase.from("identity_briefs").select("id").eq("user_id", userId).eq("local_date", localDate).maybeSingle();
  if (existente && !replace) {
    return NextResponse.json({ ok: true, briefId: existente.id, yaExistia: true });
  }

  const hechas = await generacionesDeHoy(supabase, userId, localDate);
  if (hechas >= MAX_GENERACIONES) {
    return NextResponse.json({ ok: false, reason: "Se alcanzó el tope de generaciones de hoy." }, { status: 429 });
  }

  const cargado = await loadContextoDelBrief({
    supabase,
    userId,
    today: localDate,
    timeZone,
    sources: await fuentesDe(supabase, userId),
    modo: "servicio"
  });
  if (!cargado.ok) return NextResponse.json({ ok: false, reason: cargado.reason }, { status: 409 });

  const saneado = sanearBrief(payload, cargado.contexto.saneado, LIMITES_AGENTE);
  if (!saneado.ok || !saneado.brief) {
    return NextResponse.json(
      { ok: false, reason: "El brief no sobrevivió al saneado.", problemas: saneado.problemas, rechazadas: saneado.rechazadas },
      { status: 422 }
    );
  }

  const guardado = await guardarBrief({
    supabase,
    userId,
    today: localDate,
    hechas,
    reemplaza: replace,
    producido: {
      ok: true,
      brief: saneado.brief,
      generator: "py",
      tono: cargado.contexto.preferencias.tono,
      model,
      agentVersion,
      meta: {
        fuente: "py",
        motivoRespaldo: null,
        via: "endpoint",
        model,
        agentVersion,
        facts: cargado.contexto.factCount,
        saneados: saneado.problemas.length
      }
    }
  });

  if (!guardado.ok) return NextResponse.json({ ok: false, reason: guardado.reason }, { status: 500 });
  return NextResponse.json({ ok: true, briefId: guardado.brief.id, saneados: saneado.problemas });
}
