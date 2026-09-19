import { loadRitualGate, loadRitualContent } from "@/lib/data/ritual";
import { debeMostrarseHoy } from "@/lib/domain/ritual/decidir.ts";
import { construirSecuencia, hayContenido } from "@/lib/domain/ritual/secuencia.ts";
import { publicEnv } from "@/config/env";
import RitualHost, { type DatosDelRitual } from "./RitualHost";

/**
 * Decide si hoy hay arranque, y con qué. `null` si no — que es el caso común:
 * la política nace apagada.
 *
 * DOS PASADAS POR `debeMostrarseHoy()`, y son necesarias:
 *
 *  1. La primera es BARATA —una RPC— y descarta los casos de fondo: política
 *     apagada, hoy no toca, fuera de ventana, ya visto. Con la política apagada,
 *     la puerta termina aquí y cada carga de página de la aplicación entera paga
 *     una lectura de una tabla de una fila.
 *  2. La segunda solo corre si la primera dijo que sí, y es la que pregunta si
 *     hay CONTENIDO de verdad. Para saberlo hay que construir la secuencia, y
 *     para construirla hay que leer media aplicación — por eso no se hace antes.
 */
async function datosDeHoy(): Promise<DatosDelRitual | null> {
  const puerta = await loadRitualGate();
  if (!puerta) return null;

  // `hayContenido: true` provisional: todavía no se ha construido nada, y lo que
  // se está comprobando en esta pasada son los otros cinco motivos.
  const previa = debeMostrarseHoy({
    settings: puerta.settings,
    dateISO: puerta.dateISO,
    hourLocal: puerta.hourLocal,
    yaHayEjecucionHoy: puerta.yaHayEjecucionHoy,
    hayContenido: true
  });
  if (!previa.mostrar) return null;

  const contenido = await loadRitualContent(puerta);
  if (!contenido) return null;

  const definitiva = debeMostrarseHoy({
    settings: puerta.settings,
    dateISO: puerta.dateISO,
    hourLocal: puerta.hourLocal,
    yaHayEjecucionHoy: puerta.yaHayEjecucionHoy,
    // Un saludo y un cierre solos no son un ritual. Si es todo lo que hay, la
    // capa no se monta y la persona ve su pantalla, que es lo que pidió.
    //
    // EXCEPCIÓN: si el brief todavía no existe y se va a pedir el respaldo, la
    // secuencia de ahora mismo está incompleta a propósito. Juzgarla vacía aquí
    // dejaría sin arranque justo a quien estrena la aplicación.
    hayContenido:
      hayContenido(construirSecuencia(contenido)) ||
      (!contenido.hayBriefDeHoy && !contenido.briefIntentadoHoy && puerta.settings.aiEnabled)
  });
  if (!definitiva.mostrar) return null;

  return {
    contenido,
    blocking: puerta.settings.blocking,
    currency: publicEnv.NEXT_PUBLIC_DEFAULT_CURRENCY,
    locale: publicEnv.NEXT_PUBLIC_DEFAULT_LOCALE
  };
}

/**
 * La puerta del arranque guiado (D-165). Server Component.
 *
 * Pinta el anfitrión SIEMPRE, también sin datos: es lo que permite que el
 * overlay sobreviva a las revalidaciones que él mismo provoca (ver
 * `RitualHost`). Un anfitrión con `null` no pinta nada.
 */
export default async function RitualGate() {
  return <RitualHost datos={await datosDeHoy()} />;
}
