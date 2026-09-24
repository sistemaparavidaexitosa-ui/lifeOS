import { NextResponse } from "next/server";
import { loadRitualGate, loadRitualContent } from "@/lib/data/ritual";
import { sugerenciasDelCentro } from "@/lib/centro/sugerencias";
import { costumbreDeAhora } from "@/lib/comando/costumbre";
import { getUserTimeZone } from "@/lib/data/profile";
import { hourInTimeZone } from "@/lib/domain/datetime.ts";
import { franjaDeHoy } from "@/lib/domain/centro/franja.ts";
import { flagsDelRuntime } from "@/config/env";
import { armarPantalla } from "@/lib/centro/runtime/pantalla";
import { respuestaDelCentro } from "@/lib/domain/centro/runtime/respuesta.ts";
import type { Intent } from "@/lib/domain/centro/runtime/types.ts";

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

  // El runtime (D-188) va DESPUÉS y tampoco manda: sin el flag no se toca nada
  // —la respuesta es campo por campo la de siempre, y lo fija la prueba
  // «FLAG APAGADO = HOY»—, y con él, si algo falla, `screen: null` y el Centro
  // pinta el lienzo.
  const flags = flagsDelRuntime();
  // AGENTIC_GENERATED_SCREENS: aquí entrará `interpretarIntencion(texto)` cuando
  // la barra mande lo que se escribió. En Fase 1 abrir el Centro es siempre «hoy».
  const intent: Intent = { kind: "hoy" };
  const screen = flags.runtime
    ? await armarPantalla(intent, { puerta, contenido, resumen: pensado.resumen, flags }).catch((e: unknown) => {
        console.warn("[centro-runtime] no se pudo armar la pantalla", e);
        return null;
      })
    : null;

  return NextResponse.json(
    respuestaDelCentro(
      { contenido, sugerencias: pensado.sugerencias, resumen: pensado.resumen, costumbre },
      flags,
      screen
    )
  );
}
