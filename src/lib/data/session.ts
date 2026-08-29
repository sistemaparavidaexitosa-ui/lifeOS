import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * El usuario de la sesión, UNA sola vez por request.
 *
 * POR QUÉ EXISTE
 * `supabase.auth.getUser()` no lee la cookie: hace un `GET /auth/v1/user`
 * contra el servidor de Supabase en cada llamada (ver `_getUser` en
 * @supabase/auth-js). Eso está bien —es lo que verifica el token de verdad, y
 * por eso no se sustituye por `getSession()`— pero se estaba llamando CINCO
 * veces para pintar /execution: el middleware, el layout, la página, y otra
 * vez dentro de `getUserTimeZone()` y de `listWorkspaces()`. Cinco viajes de
 * ida y vuelta, en serie, solo para preguntar cinco veces quién eres.
 *
 * `cache()` de React deduplica por request: la primera llamada hace la
 * petición y las demás reciben el mismo resultado sin tocar la red. Con esto
 * el render entero gasta UNA.
 *
 * Sigue quedando la del middleware, y no es un descuido: corre en otra
 * invocación (antes del render), así que no puede compartir esta caché, y ahí
 * es donde @supabase/ssr refresca el token de sesión. Son 2 en total, no 5.
 *
 * Nunca lanza: sin sesión devuelve `null` y quien llama decide si redirige.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
});
