// src/lib/identity/brief-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { getUserTimeZone, todayForUser } from "@/lib/data/profile";
import { loadSourceSnapshot } from "@/lib/data/development";
import { actionFailed, actionOk, type ActionResult } from "@/lib/supabase/errors";
import { MAX_AFIRMACIONES } from "@/lib/domain/identity/payload.ts";
import { generarManifestacion } from "./manifestacion";
import { generacionesDeHoy, guardarBrief, MAX_GENERACIONES } from "./guardar-brief";
import { briefDeFila, type BriefView } from "./brief-view";

type Resultado = ActionResult & { brief?: BriefView };

/**
 * El brief de hoy: si ya existe lo devuelve; si no, lo genera y lo guarda.
 *
 * Devuelve el brief en la respuesta y no solo revalida: la tarjeta lo pinta con
 * lo que recibe, sin depender de que la página se vuelva a pedir.
 */
export async function generateTodayBrief(): Promise<Resultado> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const today = await todayForUser();

  const { data: existente } = await supabase.from("identity_briefs").select("*").eq("user_id", user.id).eq("local_date", today).maybeSingle();
  if (existente) return { ok: true, brief: briefDeFila(existente) };

  return generarYGuardar(supabase, user.id, today, { reemplaza: false });
}

/** Otro brief para hoy, hasta el tope diario. Borra el de hoy y sus reacciones. */
export async function regenerateTodayBrief(): Promise<Resultado> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };
  return generarYGuardar(supabase, user.id, await todayForUser(), { reemplaza: true });
}

async function generarYGuardar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  today: string,
  { reemplaza }: { reemplaza: boolean }
): Promise<Resultado> {
  const hechas = await generacionesDeHoy(supabase, userId, today);
  if (hechas >= MAX_GENERACIONES) {
    // «Intentos» y no «briefs»: los fallidos también cuentan, y decir «ya
    // generaste tres» a quien no ha visto ninguno sería mentirle.
    return { ok: false, reason: `Hoy ya se hicieron los ${MAX_GENERACIONES} intentos de brief que caben en un día. Mañana habrá uno nuevo.` };
  }

  // Aquí ya no se decide nada: quién escribe el brief —el agente o el
  // respaldo— lo decide `manifestacion.ts`, y esta acción solo guarda lo que
  // salga de allí.
  const resultado = await generarManifestacion({
    supabase,
    userId,
    today,
    timeZone: await getUserTimeZone(),
    sources: await loadSourceSnapshot()
  });
  if (!resultado.ok) return { ok: false, reason: resultado.reason };

  const guardado = await guardarBrief({ supabase, userId, today, producido: resultado.producido, hechas, reemplaza });
  if (!guardado.ok) return guardado;

  revalidatePath("/development/routines");
  return { ok: true, brief: guardado.brief };
}

/**
 * El id de una afirmación, de `a1` a `a20`.
 *
 * Era `/^a[1-5]$/`, y con el agente escribiendo hasta veinte afirmaciones eso
 * habría rechazado los pulgares de la sexta en adelante SIN decir nada visible
 * —la tarjeta revierte el estado y ya—. Además de un fallo de interfaz habría
 * sido un sesgo en el aprendizaje: el libro de estilo se alimenta de estas
 * reacciones, y solo habría visto las cinco primeras afirmaciones de cada día.
 */
const ID_AFIRMACION = new RegExp(`^a(?:[1-9]|1[0-9]|${MAX_AFIRMACIONES})$`);

const reaccionSchema = z.object({
  briefId: z.string().uuid(),
  itemId: z.string().regex(ID_AFIRMACION),
  reaction: z.enum(["resuena", "no_resuena"]).nullable()
});

/**
 * «Esto me resuena / esto no». Junto a marcar hecha la acción del día, es lo
 * único que la persona escribe sobre su brief (0065), y lo que el brief de
 * mañana lee para cambiar de ángulo.
 */
export async function reactToBriefItem(input: z.input<typeof reaccionSchema>): Promise<ActionResult & { reactions?: Record<string, string> }> {
  const parsed = reaccionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "Reacción no válida." };
  const { briefId, itemId, reaction } = parsed.data;

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: fila } = await supabase.from("identity_briefs").select("reactions").eq("id", briefId).maybeSingle();
  if (!fila) return { ok: false, reason: "Ese brief ya no existe." };

  const reactions = { ...((fila.reactions as Record<string, string>) ?? {}) };
  if (reaction) reactions[itemId] = reaction;
  else delete reactions[itemId];

  const { error } = await supabase.from("identity_briefs").update({ reactions }).eq("id", briefId);
  if (error) return actionFailed(error);
  return { ...actionOk, reactions };
}

const accionSchema = z.object({ briefId: z.string().uuid(), done: z.boolean() });

/**
 * Marcar hecha (o no) la acción concreta del día.
 *
 * Cierra el bucle del libro de estilo: es la señal más directa de si el brief
 * de esta mañana movió algo, y sin ella el aprendizaje solo vería cumplimiento
 * de hábitos, que responde a muchas más cosas que a lo que se leyó al
 * despertar.
 */
export async function marcarAccionDelDia(input: z.input<typeof accionSchema>): Promise<ActionResult & { done?: boolean }> {
  const parsed = accionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "No se pudo marcar la acción." };

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { error } = await supabase.from("identity_briefs").update({ action_done: parsed.data.done }).eq("id", parsed.data.briefId);
  if (error) return actionFailed(error);
  return { ...actionOk, done: parsed.data.done };
}
