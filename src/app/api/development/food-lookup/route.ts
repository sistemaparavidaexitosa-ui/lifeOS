import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchFoods } from "@/lib/data/nutrition";

export const dynamic = "force-dynamic";

/**
 * GET /api/development/food-lookup?q=…  |  ?barcode=…
 *
 * Buscador de alimentos del módulo de Nutrición, contra USDA FoodData Central
 * y Open Food Facts. El `fetch` a los proveedores sale del SERVIDOR, igual que
 * en book-lookup: así la CSP no abre `connect-src` a dos hosts más y el
 * navegador nunca habla con un tercero.
 *
 * Exige sesión, y el chequeo se queda AQUÍ aunque el middleware también
 * rechace las rutas de API sin sesión. El argumento de book-lookup aplica
 * literal —sin este `if` sería un proxy abierto a APIs de terceros con nuestra
 * IP—, y aquí además protege algo compartido: el presupuesto de 15 peticiones
 * por minuto de Open Food Facts es de la IP, o sea de TODOS los usuarios a la
 * vez. Un abuso desde fuera dejaría el buscador inservible para el que sí
 * inició sesión.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, foods: [], reason: "No autenticado" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const query = params.get("barcode") ?? params.get("q") ?? "";

  // 200 incluso cuando `ok` es false: el proveedor caído no es un error de
  // esta API, es un resultado que el cliente tiene que saber contar (D-021).
  return NextResponse.json(await searchFoods(query));
}
