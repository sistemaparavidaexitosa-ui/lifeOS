// src/lib/identity/brief-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { getUserTimeZone, todayForUser } from "@/lib/data/profile";
import { loadSourceSnapshot } from "@/lib/data/development";
import { actionFailed, actionOk, type ActionResult } from "@/lib/supabase/errors";
import { generarBrief, resumenParaAuditoria } from "./generar";
import { PROMPT_VERSION } from "./prompt";
import { briefDeFila, filaDeBrief, type BriefView } from "./brief-view";

/**
 * Generaciones por persona y día, contando la primera. Es un tope de coste:
 * cada una es una o dos llamadas al modelo. Se cuenta en `audit_log` y no en
 * la fila del brief, porque la fila la puede borrar la persona («borrar
 * historial de IA») y el registro de auditoría no.
 */
const MAX_GENERACIONES = 3;

type Resultado = ActionResult & { brief?: BriefView };

async function generacionesDeHoy(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, today: string) {
  const { count } = await supabase
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "ai.identity_brief")
    .eq("object", today);
  return count ?? 0;
}

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

  const generado = await generarBrief({
    supabase,
    userId,
    today,
    timeZone: await getUserTimeZone(),
    sources: await loadSourceSnapshot()
  });

  // Se audita también el intento fallido: gastó cuota igual, y el tope tiene
  // que contarlo o un fallo en bucle lo esquivaría.
  await supabase.from("audit_log").insert({
    user_id: userId,
    action: "ai.identity_brief",
    object: today,
    meta: { ...resumenParaAuditoria(generado), ok: generado.ok, reemplaza }
  });

  if (!generado.ok || !generado.brief) return { ok: false, reason: generado.reason ?? "No se pudo generar el brief." };

  if (reemplaza) {
    const { error } = await supabase.from("identity_briefs").delete().eq("user_id", userId).eq("local_date", today);
    if (error) return actionFailed(error);
  }

  const { data, error } = await supabase
    .from("identity_briefs")
    .insert({
      user_id: userId,
      local_date: today,
      ...filaDeBrief(generado.brief),
      model: generado.model ?? "",
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
    return actionFailed(error);
  }

  revalidatePath("/development/routines");
  return { ok: true, brief: briefDeFila(data) };
}

const reaccionSchema = z.object({
  briefId: z.string().uuid(),
  itemId: z.string().regex(/^a[1-5]$/),
  reaction: z.enum(["resuena", "no_resuena"]).nullable()
});

/**
 * «Esto me resuena / esto no». Es la única escritura de la persona sobre su
 * brief (0065), y lo que el brief de mañana lee para cambiar de ángulo.
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
