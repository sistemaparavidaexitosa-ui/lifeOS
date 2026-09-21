"use server";
import "server-only";
// src/lib/comando/visitas.ts
// Apuntar por dónde navegas, y poder borrarlo (D-183).
//
// LA SEGUNDA FUNCIÓN NO ES UN EXTRA, ES LA CONDICIÓN
// Este archivo guarda la ruta COMPLETA, con sus parámetros: queda escrito a
// qué proyecto entraste y qué ticker miraste. En este repositorio la regla para
// lo que el sistema cree saber de ti es que puedas verlo y borrarlo —es el
// motivo por el que la memoria es `memory_items` editable y no un almacén de
// vectores—. Por eso `nav_visitas` es tabla propia con DELETE, y no
// `audit_log`, que es append-only a propósito.
//
// NUNCA LANZA al apuntar: por dónde pasas es contabilidad, no el trabajo, y
// que falle no puede llevarse por delante una navegación.

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { todayForUser, getUserTimeZone } from "@/lib/data/profile";
import { hourInTimeZone } from "@/lib/domain/datetime.ts";
import { franjaDeHoy } from "@/lib/domain/centro/franja.ts";
import type { ActionResult } from "@/lib/supabase/errors";

/** Rutas que NO se apuntan: pasar por ellas no dice nada de tu ritmo. */
const NO_SE_APUNTAN = ["/login", "/onboarding", "/settings"];

export async function registrarVisita(ruta: string): Promise<void> {
  try {
    if (!ruta.startsWith("/") || NO_SE_APUNTAN.some((r) => ruta.startsWith(r))) return;

    const user = await getSessionUser();
    if (!user) return;

    const supabase = await createClient();
    const [today, timeZone] = await Promise.all([todayForUser(), getUserTimeZone()]);

    await supabase.from("nav_visitas").insert({
      user_id: user.id,
      // Se corta: una ruta larguísima es un parámetro que se fue de madre, no
      // una preferencia, y no hace falta guardarla entera para aprender nada.
      ruta: ruta.slice(0, 300),
      franja: franjaDeHoy(hourInTimeZone(timeZone)),
      local_date: today
    });
  } catch {
    // Una visita sin apuntar es peor estadística, no un fallo del producto.
  }
}

/**
 * Borra TODO tu historial de navegación.
 *
 * Sin filtros ni medias tintas: si alguien quiere que el sistema deje de saber
 * por dónde anda, la respuesta no puede ser «borra los últimos siete días».
 */
export async function borrarHistorialDeNavegacion(): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Sin sesión." };

  const supabase = await createClient();
  const { error } = await supabase.from("nav_visitas").delete().eq("user_id", user.id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
