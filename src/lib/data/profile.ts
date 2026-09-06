import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE, isValidTimeZone, todayInTimeZone } from "@/lib/domain/datetime.ts";
import { getSessionUser } from "@/lib/data/session";

/**
 * Zona horaria del usuario (profiles.timezone). Envuelta en React `cache()`:
 * varias vistas y Server Actions la piden dentro del mismo request y solo se
 * consulta una vez.
 *
 * Nunca lanza: si no hay sesión, no hay perfil, o la zona guardada es
 * inválida, cae a DEFAULT_TIMEZONE. Una fecha equivocada es un bug; una
 * página caída por un typo en Configuración es peor.
 */
export const getUserTimeZone = cache(async (): Promise<string> => {
  try {
    const supabase = await createClient();
    const user = await getSessionUser();
    if (!user) return DEFAULT_TIMEZONE;

    const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", user.id).single();
    const timeZone = profile?.timezone;
    return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
});

/**
 * «Hoy» para el usuario que mira la pantalla (D-016).
 *
 * Es `todayLocal(await getUserTimeZone())`, que estaba escrito igual en 28
 * sitios. No contradice la advertencia de `data/dates.ts` —la que prohíbe un
 * `todayLocal()` sin argumentos— sino que la cumple en un solo lugar: la zona
 * sigue saliendo de `profiles.timezone`, nunca del reloj del proceso, que en
 * Vercel es UTC y corría el día del usuario.
 *
 * Vive aquí y no en `dates.ts` porque necesita leer el perfil, y `dates.ts` es
 * un módulo puro que también importan las páginas.
 */
export async function todayForUser(): Promise<string> {
  return todayInTimeZone(await getUserTimeZone());
}
