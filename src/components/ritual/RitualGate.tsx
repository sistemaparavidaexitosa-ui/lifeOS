import { loadRitualGate, loadRitualContent } from "@/lib/data/ritual";
import { debeMostrarseHoy } from "@/lib/domain/ritual/decidir.ts";
import { construirSecuencia, hayContenido } from "@/lib/domain/ritual/secuencia.ts";
import { publicEnv, flagsDelRuntime } from "@/config/env";
import { getPersonalWorkspace } from "@/lib/data/workspaces";
import { headers } from "next/headers";
import { greetingFor } from "@/lib/domain/datetime.ts";
import { debeAbrirseElCentro } from "@/lib/domain/centro/apertura.ts";
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
  const puerta = await loadRitualGate();
  // Sin puerta —sin sesión, o la consulta falló— la capa entera desaparece en
  // silencio: es opcional y no puede tumbar el layout de nadie.
  if (!puerta) return null;

  // LA DECISIÓN DE ABRIR EL CENTRO SE TOMA AQUÍ, EN EL SERVIDOR (D-168).
  //
  // Antes vivía en un efecto del cliente, porque «¿es el principio de una
  // visita?» se resolvía con `sessionStorage`. Eso producía el parpadeo que el
  // usuario notó: primero la app normal, y el centro después de hidratar. Ahora
  // la marca la pone el middleware en una cookie de sesión y llega como
  // cabecera, así que el centro viaja en el primer HTML o no viaja.
  //
  // `x-forwarded-…` y compañía no valen aquí: se lee la cabecera propia, que
  // solo puede haber puesto nuestro middleware.
  const cabeceras = await headers();
  const abrirCentro = debeAbrirseElCentro({
    modo: puerta.navMode,
    inicioDeVisita: cabeceras.get("x-visita-nueva") === "1",
    // La ruta la manda el middleware: el layout no la conoce, y las cabeceras
    // internas de Next no están garantizadas en la primera petición del
    // documento, que es justo la que importa aquí. Sin ella no se abre, que es
    // el lado seguro: siempre queda el botón.
    ruta: cabeceras.get("x-ruta") ?? ""
  });

  return (
    <RitualHost
      datos={await datosDeHoy()}
      abrirCentro={abrirCentro}
      navMode={puerta.navMode}
      // D-194: con el runtime encendido, el Centro es el agente — su propia
      // superficie, sin nada del armazón premium.
      agente={flagsDelRuntime().runtime}
      ritualPermitido={puerta.settings.enabled}
      workspaceId={(await getPersonalWorkspace())?.id ?? null}
      hourLocal={puerta.hourLocal}
      // El saludo viaja ya hecho para que el centro pinte al instante, sin
      // esperar a `/api/centro`.
      cabecera={{ saludo: greetingFor(puerta.hourLocal), nombre: puerta.nombre, dateISO: puerta.dateISO }}
      currency={publicEnv.NEXT_PUBLIC_DEFAULT_CURRENCY}
      locale={publicEnv.NEXT_PUBLIC_DEFAULT_LOCALE}
    />
  );
}
