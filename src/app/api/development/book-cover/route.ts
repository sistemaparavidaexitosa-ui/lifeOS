import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedCoverUrl } from "@/lib/domain/development/book-lookup.ts";

export const dynamic = "force-dynamic";

/** Ninguna portada justifica dejar una petición colgada (igual que books.ts). */
const TIMEOUT_MS = 6000;
/**
 * Una portada `-M` de Open Library pesa ~16 KB. 5 MB es un techo absurdo a
 * propósito: no está para ajustar nada, sino para que un proveedor que un día
 * devuelva algo que no es una miniatura no se transmita entero.
 */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * GET /api/development/book-cover?url=…
 *
 * Sirve la portada de un libro DESDE NUESTRO ORIGEN. El navegador nunca habla
 * con Open Library ni con Google Books: pide la imagen aquí y este handler la
 * trae por el servidor.
 *
 * EL PORQUÉ (regresión del 2026-08-26, portadas rotas en la biblioteca):
 * `covers.openlibrary.org` ya no sirve la imagen, RESPONDE 302 hacia
 * `archive.org`, que a su vez redirige a un nodo `iaNNNNNN.us.archive.org`
 * distinto entre peticiones. La CSP se evalúa en CADA salto del redirect, no
 * solo en la URL inicial: tener `covers.openlibrary.org` en `img-src` no
 * autoriza el segundo salto, así que el navegador cortaba la carga y la
 * portada quedaba rota.
 *
 * Eso NUNCA estuvo permitido de verdad; funcionaba porque hasta el 178f761 el
 * middleware vivía en la raíz y Next lo ignoraba, así que no había CSP que
 * aplicar. Arreglar la CSP destapó esto.
 *
 * Se resuelve por proxy y no ensanchando `img-src` a `archive.org` porque
 * dónde guarda Open Library sus archivos es un detalle interno suyo: hoy es
 * archive.org, y el día que cambie se rompería otra vez, en silencio y sin
 * que nada falle en build ni en local. Con el proxy, `img-src 'self'` basta y
 * la CSP deja de depender de la infraestructura de un tercero.
 *
 * Exige sesión por la misma razón que /api/development/book-lookup: sin el
 * `if`, esto sería un proxy de imágenes abierto corriendo con nuestra IP.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "No autenticado" }, { status: 401 });
  }

  const target = request.nextUrl.searchParams.get("url") ?? "";
  // `url` viaja en la query y eso lo edita cualquiera. Misma lista blanca que
  // usa el guardado (COVER_HOSTS): solo https y solo los hosts de portada.
  // `isAllowedCoverUrl("")` es true —vacío significa "sin portada"— así que la
  // cadena vacía se descarta aparte.
  if (!target || !isAllowedCoverUrl(target)) {
    return new NextResponse(null, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      // El servidor SÍ sigue los redirects: es justo lo que el navegador no
      // podía hacer sin violar la CSP.
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "image/*", "User-Agent": "LifeOS/0.1 (biblioteca personal)" },
      cache: "no-store"
    });
  } catch {
    // Timeout, DNS, proveedor caído: todos son el mismo caso para el <img>.
    return new NextResponse(null, { status: 404 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !contentType.startsWith("image/")) {
    // Open Library responde 404 cuando no tiene la portada, y a veces sirve
    // un HTML de error con 200. Ninguna de las dos se pasa como imagen.
    return new NextResponse(null, { status: 404 });
  }

  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return new NextResponse(null, { status: 404 });

  const bytes = await upstream.arrayBuffer();
  // El content-length puede faltar o mentir: el tamaño real se revisa también.
  if (bytes.byteLength > MAX_BYTES) return new NextResponse(null, { status: 404 });

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // `private` porque la respuesta va detrás de sesión: la cachea el
      // navegador del usuario, no un CDN compartido. Una portada se identifica
      // por el id de Open Library y no cambia, así que 30 días es conservador.
      "Cache-Control": "private, max-age=2592000",
      "Content-Length": String(bytes.byteLength)
    }
  });
}
