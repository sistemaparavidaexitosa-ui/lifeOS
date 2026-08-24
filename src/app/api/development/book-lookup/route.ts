import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupBooks } from "@/lib/integrations/books";

export const dynamic = "force-dynamic";

/**
 * GET /api/development/book-lookup?isbn=…  |  ?q=…
 *
 * Prellenado del formulario de libro con metadatos de Open Library / Google
 * Books (§5.1 del spec del módulo). El `fetch` a los proveedores sale del
 * SERVIDOR, no del navegador: así la CSP no necesita abrir `connect-src` a
 * dos hosts más, y el navegador nunca habla con un tercero. Lo único que sí
 * viaja al navegador es la imagen de la portada (ver `img-src` en
 * middleware.ts).
 *
 * Exige sesión, y el chequeo tiene que estar AQUÍ. Una página protegida
 * redirige a /login por su cuenta (`if (!user) redirect(...)` en cada
 * page.tsx); un Route Handler no tiene ese reflejo, y el middleware —que sí
 * lo tendría— hoy no corre: `middleware.ts` está en la raíz mientras la app
 * vive en `src/`, así que Next lo ignora (verificado el 2026-08-23,
 * `middleware-manifest.json` sin entradas). Sin este `if`, la ruta sería un
 * proxy abierto a APIs de terceros con nuestra IP.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, candidates: [], reason: "No autenticado" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const query = params.get("isbn") ?? params.get("q") ?? "";

  const result = await lookupBooks(query);
  // 200 incluso cuando `ok` es false: el proveedor caído no es un error de
  // esta API, es un resultado que el cliente tiene que saber contar. El
  // cuerpo lleva `ok` y `reason` — mismo contrato que sendEmail (D-021).
  return NextResponse.json(result);
}
