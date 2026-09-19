// src/lib/ritual/actions.ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { todayForUser } from "@/lib/data/profile";
import { actionFailed, actionOk, type ActionResult } from "@/lib/supabase/errors";
import { loadRitualGate, loadRitualContent, type ContenidoDelRitual } from "@/lib/data/ritual";

/**
 * Las acciones del arranque guiado (D-165).
 *
 * NINGUNA REVALIDA NADA, y es deliberado. El overlay se desmonta solo cuando
 * termina o se omite, así que un `revalidatePath` aquí repintaría la pantalla de
 * debajo justo en el momento en que aparece — un parpadeo gratuito al final del
 * ritual. Lo único que sí revalida es marcar un hábito, y de eso se encarga
 * `toggleHabitToday`, que ya lo hacía antes de que este módulo existiera.
 *
 * Todas siguen el contrato `ActionResult`: devuelven el motivo, nunca lanzan.
 * Una capa opcional no puede tirar la pantalla de nadie.
 */

const pasoSchema = z.string().max(40);
const conteoSchema = z.number().int().min(0).max(999);

async function sesion() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;
  return { supabase, user, today: await todayForUser() };
}

/**
 * Marca que el arranque se mostró hoy.
 *
 * SE LLAMA AL MONTAR, no al cerrar: «primera sesión del día» es literalmente eso.
 * El coste conocido —abrir la app y cerrar la pestaña consume el arranque— está
 * aceptado por escrito, y la salida es el botón «Repetir el arranque de hoy».
 *
 * Un `upsert` que manda SOLO `steps_total`: si la fila ya existe no se pisan ni
 * `started_at` ni el progreso ni la marca de omitido. Llevó `ignoreDuplicates`,
 * y la prueba de navegador lo tumbó: la ruta del respaldo del brief se dispara a
 * la vez y a veces crea la fila primero, así que el total se quedaba en cero
 * para siempre.
 */
export async function startRitual(stepsTotal: number): Promise<ActionResult> {
  const s = await sesion();
  if (!s) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const total = conteoSchema.safeParse(stepsTotal);
  if (!total.success) return { ok: false, reason: "Número de pasos inválido." };

  const { error } = await s.supabase
    .from("ritual_runs")
    .upsert(
      { user_id: s.user.id, local_date: s.today, steps_total: total.data },
      { onConflict: "user_id,local_date" }
    );
  if (error) return actionFailed(error);

  await s.supabase.from("audit_log").insert({ user_id: s.user.id, action: "ritual.start" });
  return actionOk;
}

/** Guarda por dónde va, para que la pantalla de admin pueda medir dónde se cae la gente. */
export async function advanceRitual(lastStep: string, stepsDone: number): Promise<ActionResult> {
  const s = await sesion();
  if (!s) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const paso = pasoSchema.safeParse(lastStep);
  const hechos = conteoSchema.safeParse(stepsDone);
  if (!paso.success || !hechos.success) return { ok: false, reason: "Paso inválido." };

  const { error } = await s.supabase
    .from("ritual_runs")
    .update({ last_step: paso.data, steps_done: hechos.data })
    .eq("user_id", s.user.id)
    .eq("local_date", s.today);
  if (error) return actionFailed(error);
  return actionOk;
}

/**
 * «Ahora no».
 *
 * Omitir no es fallar y no se guarda como tal: queda `skipped = true` y el paso
 * por el que se iba, que es lo que de verdad dice algo — si todo el mundo se
 * cae en el mismo paso, el paso es el problema.
 */
export async function skipRitual(lastStep: string, stepsDone: number): Promise<ActionResult> {
  const s = await sesion();
  if (!s) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const paso = pasoSchema.safeParse(lastStep);
  const hechos = conteoSchema.safeParse(stepsDone);
  if (!paso.success || !hechos.success) return { ok: false, reason: "Paso inválido." };

  const { error } = await s.supabase
    .from("ritual_runs")
    .update({ skipped: true, last_step: paso.data, steps_done: hechos.data })
    .eq("user_id", s.user.id)
    .eq("local_date", s.today);
  if (error) return actionFailed(error);

  await s.supabase.from("audit_log").insert({ user_id: s.user.id, action: "ritual.skip" });
  return actionOk;
}

export async function completeRitual(stepsDone: number): Promise<ActionResult> {
  const s = await sesion();
  if (!s) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const hechos = conteoSchema.safeParse(stepsDone);
  if (!hechos.success) return { ok: false, reason: "Número de pasos inválido." };

  const { error } = await s.supabase
    .from("ritual_runs")
    .update({ completed_at: new Date().toISOString(), steps_done: hechos.data, skipped: false })
    .eq("user_id", s.user.id)
    .eq("local_date", s.today);
  if (error) return actionFailed(error);

  await s.supabase.from("audit_log").insert({ user_id: s.user.id, action: "ritual.complete" });
  return actionOk;
}

/**
 * El contenido del arranque para REPETIRLO a mano desde `/development/routines`.
 *
 * Es la salida del coste aceptado en D-165: la marca de «ya se mostró» se
 * escribe al montar, así que abrir la app y cerrar la pestaña consume el
 * arranque del día. Esto lo devuelve sin tocar esa marca y sin mirar la ventana
 * horaria —pedirlo es un gesto explícito, no un disparo automático—, pero SÍ
 * respeta que la política y la preferencia estén encendidas: repetir no es una
 * puerta trasera para ver algo que alguien apagó.
 */
export async function contenidoParaRepetir(): Promise<
  | { ok: true; contenido: ContenidoDelRitual; blocking: boolean }
  | { ok: false; reason: string }
> {
  const puerta = await loadRitualGate();
  if (!puerta) return { ok: false, reason: "No se pudo leer el arranque de hoy." };
  if (!puerta.settings.enabled) return { ok: false, reason: "El arranque del día está apagado." };

  const contenido = await loadRitualContent(puerta);
  if (!contenido) return { ok: false, reason: "No se pudo preparar el arranque de hoy." };
  return { ok: true, contenido, blocking: puerta.settings.blocking };
}
