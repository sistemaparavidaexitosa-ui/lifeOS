import { NextResponse } from "next/server";
import { loadRitualGate, loadRitualContent } from "@/lib/data/ritual";

/**
 * El contenido del centro premium (D-166).
 *
 * POR QUÉ UNA RUTA Y NO EL LAYOUT. Con premium por defecto, cada carga de
 * página de cada persona pasa por el layout de `(app)`. Si el contenido del
 * centro —rutinas, dinero, tareas, brief— se leyera ahí, toda la aplicación
 * pagaría media aplicación en cada clic. La puerta del layout sigue costando
 * una RPC; esto se pide SOLO al abrir el centro.
 *
 * Y por `fetch` y no como Server Action, por lo mismo que el respaldo del brief:
 * Next ejecuta en fila las Server Actions de un mismo cliente, y el centro se
 * abre justo cuando la persona quiere hacer algo.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const puerta = await loadRitualGate();
  if (!puerta) return NextResponse.json({ ok: false, reason: "Sin sesión." }, { status: 401 });

  const contenido = await loadRitualContent(puerta);
  if (!contenido) return NextResponse.json({ ok: false, reason: "No se pudo preparar el centro." }, { status: 503 });

  return NextResponse.json({ ok: true, contenido });
}
