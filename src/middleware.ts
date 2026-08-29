import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError, type User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/config/env";

/**
 * Tope de tiempo para averiguar quién eres. Existe por un 504 en producción
 * (2026-08-29, `MIDDLEWARE_INVOCATION_TIMEOUT`): el sitio ENTERO dejó de
 * responder, no una ruta suelta, porque el middleware corre antes que
 * cualquier página y su matcher cubre casi todo.
 *
 * `supabase.auth.getUser()` no lee la cookie: hace un viaje de red a
 * `/auth/v1/user` (la misma nota está en lib/data/session.ts). Sin límite
 * propio, si Supabase no contesta hay DOS relojes que se nos van de las manos:
 *
 *   1. el `fetch` en sí, que puede quedarse colgado indefinidamente; y
 *   2. peor, el reintento de @supabase/auth-js al refrescar el token, que
 *      insiste con backoff exponencial durante 30 s (`AUTO_REFRESH_TICK_DURATION`
 *      en GoTrueClient) — más que los 25 s a los que Vercel mata el middleware.
 *
 * Por (2) no basta con acortar el fetch: hace falta un plazo para la operación
 * COMPLETA. Tres segundos son holgados para una llamada que normalmente tarda
 * ~200 ms, y cortan mucho antes del límite de la plataforma.
 */
const AUTH_DEADLINE_MS = 3000;

/** Centinela del plazo agotado; no puede confundirse con una respuesta real. */
const AUTH_TIMED_OUT = Symbol("auth-deadline");

/**
 * ⚠️ ESTE ARCHIVO TIENE QUE VIVIR EN `src/`, junto al directorio `app`.
 *
 * Estuvo en la raíz del repo desde el primer commit y Next.js lo ignoró en
 * silencio todo ese tiempo: cuando el proyecto usa `src/`, el middleware se
 * busca en `src/middleware.ts` y punto. No hay error, no hay warning — el
 * archivo simplemente no existe para el framework. Se detectó el 2026-08-23
 * porque NINGUNA respuesta llevaba cabecera `Content-Security-Policy`, y se
 * confirmó con `middleware-manifest.json` vacío.
 *
 * Consecuencia de aquello: la CSP con nonce (F5) nunca se aplicó y el
 * refresco de sesión de @supabase/ssr nunca corrió. Si alguna vez alguien
 * mueve esto de vuelta a la raíz "para ordenar", ambas cosas se apagan otra
 * vez sin que nada falle a gritos.
 */

/**
 * F5 🔴: la CSP se define AQUÍ, con un nonce distinto por request, y NUNCA
 * como header estático en next.config.ts. Una CSP estática sin nonce
 * bloquea los scripts inline que Next.js inserta (pantalla en blanco en
 * producción). `strict-dynamic` permite que los scripts con nonce carguen
 * sus propias dependencias sin necesidad de listar cada host.
 */
export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const supabaseHost = (() => {
    try {
      return new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).origin;
    } catch {
      return "";
    }
  })();

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    // Portadas de libros (§5.1, Fase 4): NINGÚN host de tercero aquí, a
    // propósito. Se intentó y no funciona: covers.openlibrary.org responde
    // 302 hacia archive.org, que redirige a un nodo iaNNNNNN.us.archive.org
    // distinto entre peticiones, y la CSP se evalúa en CADA salto — permitir
    // el primer host no autoriza los siguientes, así que la portada quedaba
    // rota (2026-08-26). La imagen la sirve ahora nuestro propio origen desde
    // /api/development/book-cover, así que `'self'` alcanza y esta línea deja
    // de depender de dónde guarde Open Library sus archivos.
    // Se sigue guardando la URL, no el archivo (D-002).
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${supabaseHost} https://*.supabase.co wss://*.supabase.co`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  // Un único abort para todo lo que este request le pregunte a Supabase: al
  // vencer el plazo corta el fetch en vuelo Y hace que los reintentos internos
  // de auth-js fallen en el acto en vez de seguir esperando en el vacío.
  const authAbort = new AbortController();
  const authFetch: typeof fetch = (input, init) => {
    const signal =
      init?.signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([init.signal, authAbort.signal])
        : authAbort.signal;
    return fetch(input, { ...init, signal });
  };

  // Refresco de sesión Supabase en cada request (patrón oficial @supabase/ssr).
  const supabase = createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { fetch: authFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        response.headers.set("Content-Security-Policy", csp);
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      }
    }
  });

  let user: User | null = null;
  // `false` = Supabase no contestó a tiempo (o no contestó). NO es lo mismo que
  // "no hay sesión", y por eso se distingue: ver el guardia de más abajo.
  let authReachable = true;

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof AUTH_TIMED_OUT>((resolve) => {
    deadlineTimer = setTimeout(() => {
      authAbort.abort();
      resolve(AUTH_TIMED_OUT);
    }, AUTH_DEADLINE_MS);
  });

  try {
    const outcome = await Promise.race([supabase.auth.getUser(), deadline]);
    if (outcome === AUTH_TIMED_OUT) {
      authReachable = false;
    } else {
      user = outcome.data.user;
      // Un fallo de red NO se lanza: auth-js lo devuelve como error. Sin esta
      // comprobación, "Supabase caído" se leería como "no has iniciado sesión".
      if (!user && outcome.error && isAuthRetryableFetchError(outcome.error)) authReachable = false;
    }
  } catch {
    authReachable = false;
  } finally {
    clearTimeout(deadlineTimer);
  }

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");
  const isPublicAsset = pathname.startsWith("/_next") || pathname.startsWith("/favicon");
  // `/api/health` es el smoke check post-deploy (DEPLOY.md paso 4): se
  // consulta desde fuera, sin sesión, y debe seguir respondiendo 200.
  const isHealthCheck = pathname === "/api/health";
  const isApiRoute = pathname.startsWith("/api/");
  // /invite/[token] es pública a propósito: el invitado llega desde el correo
  // SIN cuenta todavía. Si se redirigiera a /login, perdería el token y no
  // sabría siquiera a qué lo invitaron. La página no expone datos del
  // workspace más allá del nombre y el rol (ver invitation_preview, 0022).
  const isInvite = pathname.startsWith("/invite/");

  // `authReachable` deja pasar el request cuando el plazo se agota, en vez de
  // mandar a /login a alguien que sí tiene sesión por un tropiezo de red. No
  // abre ninguna puerta: este redirect es comodidad, no la única cerradura —
  // el layout de (app) vuelve a comprobar la sesión y redirige por su cuenta
  // ("defensa en profundidad", app/(app)/layout.tsx), los Route Handlers
  // devuelven 401 solos, y por debajo de todo sigue estando RLS.
  if (!user && authReachable && !isAuthRoute && !isPublicAsset && !isInvite && !isHealthCheck && pathname !== "/") {
    // Una ruta de API no se redirige a /login: quien la llama es `fetch`, no
    // un navegador, y recibiría el HTML del login con estado 200 en vez de un
    // error que pueda leer. Devuelve el mismo cuerpo que ya usan los Route
    // Handlers cuando falta sesión.
    if (isApiRoute) {
      const denied = NextResponse.json({ ok: false, reason: "No autenticado" }, { status: 401 });
      denied.headers.set("Content-Security-Policy", csp);
      return denied;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // El redirect también lleva CSP: era el único camino de respuesta que se
    // quedaba sin ella.
    const redirected = NextResponse.redirect(url);
    redirected.headers.set("Content-Security-Policy", csp);
    return redirected;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas excepto assets estáticos de Next y archivos
     * públicos, para no gastar el refresco de sesión en peticiones que no lo
     * necesitan.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
