// src/lib/centro/runtime/pantalla.ts
// Plan → hidratar → layout → validar (D-188, D-189). SERVIDOR.
//
// Devuelve `null` cuando la pantalla no pasa el validador, y lo avisa en el log
// del servidor: `null` significa «pinta el lienzo de siempre», que es el
// respaldo por diseño, no un error que la persona tenga que ver.

import { greetingFor } from "@/lib/domain/datetime.ts";
import { construirSecuencia } from "@/lib/domain/ritual/secuencia.ts";
import { franjaDeHoy } from "@/lib/domain/centro/franja.ts";
import { generadorDeterminista } from "@/lib/domain/centro/runtime/generador.ts";
import { ensamblarPantalla, type Hidratadores } from "@/lib/domain/centro/runtime/ensamblar.ts";
import { hidratadoresDeHoy, type FuentesDeHoy, type LectorDelGrafo } from "@/lib/domain/centro/runtime/hoy.ts";
import { aplicarLayout } from "@/lib/domain/centro/runtime/layout.ts";
import { validarPorSeccion, validarScreen } from "@/lib/domain/centro/runtime/validador.ts";
import type { FlagsDelRuntime } from "@/lib/domain/centro/runtime/flags.ts";
import type { Intent, Screen } from "@/lib/domain/centro/runtime/types.ts";
import type { ContenidoDelRitual, PuertaDelRitual } from "@/lib/data/ritual";
import { lectorDelGrafo } from "./grafo";

export interface EntradaDePantalla {
  puerta: PuertaDelRitual;
  contenido: ContenidoDelRitual;
  resumen: string;
  flags: FlagsDelRuntime;
}

/**
 * Lo que la pantalla «Hoy» necesita, sacado de lo que la ruta YA cargó. Los
 * hábitos pendientes se cuentan igual que en `CentroPremium` (D-177): la regla
 * de la hora vive en `construirSecuencia` y no se escribe dos veces.
 */
function fuentesDeHoy(e: EntradaDePantalla): FuentesDeHoy {
  const c = e.contenido;
  return {
    saludo: greetingFor(e.puerta.hourLocal),
    nombre: e.puerta.nombre,
    fechaISO: e.puerta.dateISO,
    resumen: e.resumen,
    unicaCosa: c.plan?.oneThing ?? null,
    tareas: c.plan?.tareas ?? [],
    senales: c.senales,
    habitosPendientes: construirSecuencia({
      ...c,
      settings: { ...c.settings, steps: ["routineStep"], maxRoutineSteps: 99 }
    }).filter((p) => p.kind === "routineStep").length
  };
}

export async function armarPantalla(intent: Intent, e: EntradaDePantalla): Promise<Screen | null> {
  return (await armarPantallaConProyectos(intent, e)).screen;
}

/**
 * Lo mismo, y además los proyectos que el grafo devolvió. El agente (D-195)
 * mete las secciones de «Hoy» en su turno y las vuelve a validar allí: sin
 * estos proyectos, un enlace `?project=` que aquí era legal dejaba de serlo.
 */
export async function armarPantallaConProyectos(
  intent: Intent,
  e: EntradaDePantalla
): Promise<{ screen: Screen | null; proyectos: { id: string }[] }> {
  const plan = await generadorDeterminista.generar({ intent, franja: franjaDeHoy(e.puerta.hourLocal), flags: e.flags });

  // Los proyectos que el grafo devolvió son los únicos que la pantalla puede
  // enlazar con `?project=`: vienen de una RPC con RLS, así que son tuyos.
  const vistos: { id: string }[] = [];
  const grafo: LectorDelGrafo = {
    async proyectoDeTarea(id) {
      const p = await lectorDelGrafo.proyectoDeTarea(id);
      if (p) vistos.push({ id: p.id });
      return p;
    }
  };

  const hidratadores: Hidratadores = intent.kind === "hoy" ? hidratadoresDeHoy(fuentesDeHoy(e), grafo) : {};
  const screen = aplicarLayout(await ensamblarPantalla(plan, hidratadores), e.flags);

  // Sección por sección (T1): antes se validaba la pantalla ENTERA de una
  // vez, así que un solo título con `<` o un href fuera de la app tiraba todo
  // «Hoy» al respaldo. Ahora se descartan solo las secciones que no pasan
  // (como ya hacía `componerTurno` en el turno del agente) y se valida la
  // envoltura con las que sobreviven.
  const buenas = validarPorSeccion(screen.sections, vistos, "centro-runtime");
  if (buenas.length === 0) {
    console.warn(`[centro-runtime] pantalla «${plan.id}» rechazada: ninguna sección pasó la validación.`);
    return { screen: null, proyectos: vistos };
  }

  const r = validarScreen({ ...screen, sections: buenas }, { proyectos: vistos });
  if (!r.ok) {
    console.warn(`[centro-runtime] pantalla «${plan.id}» rechazada: ${r.reason}`);
    return { screen: null, proyectos: vistos };
  }
  return { screen: r.screen, proyectos: vistos };
}
