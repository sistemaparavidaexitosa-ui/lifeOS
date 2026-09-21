import { NextResponse } from "next/server";
import { loadRitualGate, loadRitualContent } from "@/lib/data/ritual";
import { sugerenciasDelCentro } from "@/lib/centro/sugerencias";
import { costumbreDeAhora } from "@/lib/comando/costumbre";
import { getUserTimeZone } from "@/lib/data/profile";
import { hourInTimeZone } from "@/lib/domain/datetime.ts";
import { franjaDeHoy } from "@/lib/domain/centro/franja.ts";

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
// Pensar las sugerencias puede costar unos segundos cuando toca franja nueva.
export const maxDuration = 60;

export async function GET() {
  const puerta = await loadRitualGate();
  if (!puerta) return NextResponse.json({ ok: false, reason: "Sin sesión." }, { status: 401 });

  // Las dos mitades van en paralelo, y las SUGERENCIAS NO MANDAN: si su promesa
  // falla o el modelo no contesta, se devuelve la lista vacía y el centro se
  // pinta igual. Es un extra, no el contenido.
  const timeZone = await getUserTimeZone();
  const franja = franjaDeHoy(hourInTimeZone(timeZone));

  // La costumbre (D-185) viaja con las sugerencias y por el mismo motivo: es un
  // extra que NO manda. Si falla, el centro se pinta igual, solo que sin
  // ofrecerte lo que sueles mirar a esta hora.
  const [contenido, pensado, costumbre] = await Promise.all([
    loadRitualContent(puerta),
    sugerenciasDelCentro().catch(() => ({ sugerencias: [], resumen: "" })),
    costumbreDeAhora(franja).catch(() => null)
  ]);
  if (!contenido) return NextResponse.json({ ok: false, reason: "No se pudo preparar el centro." }, { status: 503 });

  return NextResponse.json({
    ok: true,
    contenido,
    sugerencias: pensado.sugerencias,
    resumen: pensado.resumen,
    costumbre
  });
}
