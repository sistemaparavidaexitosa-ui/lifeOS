import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/config/env";

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
    // Portadas de libros (§5.1, Fase 4): la búsqueda de metadatos corre en el
    // servidor, pero la imagen la pide el navegador directo al proveedor —
    // se guarda la URL, no el archivo. Son los dos únicos hosts de terceros
    // que la app carga en el navegador; el resto de integraciones son
    // servidor a servidor y no tocan la CSP (D-002).
    `img-src 'self' data: blob: https://covers.openlibrary.org https://books.google.com`,
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

  // Refresco de sesión Supabase en cada request (patrón oficial @supabase/ssr).
  const supabase = createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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

  const {
    data: { user }
  } = await supabase.auth.getUser();

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

  if (!user && !isAuthRoute && !isPublicAsset && !isInvite && !isHealthCheck && pathname !== "/") {
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
