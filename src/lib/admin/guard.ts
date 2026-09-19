import "server-only";
import { getSessionUser } from "@/lib/data/session";
import { isPlatformAdmin } from "@/lib/data/templates";
import type { ActionResult } from "@/lib/supabase/errors";

/**
 * El tercer control de las acciones de administración: la ruta ya devuelve 404
 * y la RLS ya rechaza la escritura, pero una Server Action es un endpoint HTTP
 * y se puede invocar sin pasar por la pantalla. Sin esta comprobación el error
 * llegaría como un fallo de base de datos ilegible en vez de un «no tienes
 * permiso» que se puede pintar.
 *
 * Vivía como función local de `admin/actions.ts`. Sale a un módulo propio
 * porque el panel del arranque guiado (D-165) la necesita igual, y un archivo
 * `"use server"` solo puede exportar funciones asíncronas que sean acciones —
 * exportarla desde allí la convertiría en un endpoint más.
 *
 * `motivo` es lo que se enseña a quien no es admin: cada panel dice qué es lo
 * que no puede editar.
 */
export async function exigirAdmin(motivo: string): Promise<{ userId: string } | { error: ActionResult }> {
  const user = await getSessionUser();
  if (!user) return { error: { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." } };
  if (!(await isPlatformAdmin())) return { error: { ok: false, reason: motivo } };
  return { userId: user.id };
}
