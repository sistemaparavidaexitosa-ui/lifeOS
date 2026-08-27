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
 * dos hosts más, y el navegador nunca habla con un tercero. La portada era la
 * única excepción y dejó de serlo: también sale por el servidor, desde
 * /api/development/book-cover.
 *
 * Exige sesión, y el chequeo se queda AQUÍ aunque el middleware ya corra y
 * también rechace las rutas de API sin sesión (eso se arregló en 178f761,
 * moviéndolo a `src/`). Una página protegida redirige a /login por su cuenta
 * (`if (!user) redirect(...)` en cada page.tsx); un Route Handler no tiene ese
 * reflejo, y esta ruta no puede quedar a merced de que el middleware siga
 * cubriéndola: sin este `if`, sería un proxy abierto a APIs de terceros con
 * nuestra IP. Ya pasó una vez que el middleware no corría y nadie se enteró.
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
