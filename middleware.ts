import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/config/env";

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

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/auth");
  const isPublicAsset = request.nextUrl.pathname.startsWith("/_next") || request.nextUrl.pathname.startsWith("/favicon");
  // /invite/[token] es pública a propósito: el invitado llega desde el correo
  // SIN cuenta todavía. Si se redirigiera a /login, perdería el token y no
  // sabría siquiera a qué lo invitaron. La página no expone datos del
  // workspace más allá del nombre y el rol (ver invitation_preview, 0022).
  const isInvite = request.nextUrl.pathname.startsWith("/invite/");

  if (!user && !isAuthRoute && !isPublicAsset && !isInvite && request.nextUrl.pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
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
