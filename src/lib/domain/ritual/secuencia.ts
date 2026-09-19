// src/lib/domain/ritual/secuencia.ts
// La secuencia del arranque guiado (D-165), probada en
// tests/domain/ritual-secuencia.test.ts.
//
// AQUÍ ESTÁ LA DECISIÓN DE FONDO: la secuencia no se guarda, se CALCULA. Una
// secuencia guardada miente en cuanto los datos cambian — seguiría diciendo
// «toma agua» el día que se borra ese hábito, y seguiría diciéndolo a las once
// cuando ya se lo tomó. Lo que el administrador configura es qué TIPOS de paso
// están permitidos; el orden es narrativo y lo fija `PASOS_RITUAL`.

import { greetingFor } from "../datetime.ts";
import { PASOS_RITUAL, type HechoRitual, type PasoRitual, type RitualSettings, type TipoPaso } from "./types.ts";

/** Un hábito visto desde el ritual, con lo único que hace falta para decidir. */
export interface HabitoDelRitual {
  id: string;
  name: string;
  position: number;
  durationMin: number;
  cue: string;
  twoMinVersion: string;
  /** Con registro de hoy en CUALQUIER estado: hecho, omitido o pospuesto. */
  registradoHoy: boolean;
}

export interface RutinaDelRitual {
  id: string;
  name: string;
  /** De `routineDueToday(frequency, dateISO)`. El ritual no recalcula el calendario. */
  due: boolean;
  active: boolean;
  position: number;
  /**
   * El bloque de Autogestión del Tiempo al que está anclada, en minutos desde
   * medianoche. `null` si no tiene bloque: entonces puede tocar a cualquier hora.
   */
  bloque: { inicioMin: number; finMin: number } | null;
  habits: HabitoDelRitual[];
}

/**
 * Cuánto por delante se mira. Una rutina que empieza dentro de este margen ya es
 * «lo siguiente» y entra en el arranque; una que empieza más tarde pertenece a
 * otro momento del día y no.
 *
 * Tres horas: suficiente para que a las 6:00 entre la rutina de las 8:00, y
 * poco para que a las 9:00 entre la de la noche. No hay número perfecto; este
 * está escrito en un solo sitio y probado en sus dos bordes.
 */
export const HORIZONTE_RUTINA_MIN = 180;

/**
 * El brief, en una forma ESTRECHA y no `BriefView`.
 *
 * No es purismo: `BriefView` conoce la forma de la fila de Supabase, y este
 * módulo tiene que poder correr en el navegador cuando el overlay recalcula la
 * secuencia al llegar el brief tarde. El mapeo vive en `src/lib/data/ritual.ts`,
 * que es capa de datos y sí puede conocer ambas.
 */
export interface BriefDelRitual {
  /** Para poder marcar hecha la acción del día sin volver a buscar la fila. */
  id: string;
  affirmations: { id: string; text: string; category: string | null }[];
  mantra: string | null;
  visualization: { title: string; durationMin: number; steps: { text: string; seconds: number }[] } | null;
  dailyAction: { text: string; done: boolean } | null;
}

export interface EntradaSecuencia {
  settings: RitualSettings;
  nombre: string;
  dateISO: string;
  hourLocal: number;
  /** Minutos desde medianoche, hora LOCAL del perfil. Decide qué rutina toca ahora. */
  ahoraMin: number;
  brief: BriefDelRitual | null;
  rutinas: RutinaDelRitual[];
  contexto: HechoRitual[];
  plan: { oneThing: string | null; tareas: { id: string; title: string }[] } | null;
}

/** El cierre. Una sola frase, y siempre la misma: es la puerta a la ejecución. */
const FRASE_DE_CIERRE = "¿Qué quieres hacer hoy?";

/** Los dos pasos que son marco, no contenido. Ver `hayContenido`. */
const PASOS_DE_MARCO: TipoPaso[] = ["greeting", "closing"];

function pasosDeRutina(e: EntradaSecuencia): PasoRitual[] {
  const pendientes: PasoRitual[] = [];

  // LA HORA DEL DÍA DECIDE. Una rutina anclada a un bloque tiene su momento: si
  // ya pasó, no se propone (vive en Rutinas, donde se puede registrar tarde); si
  // empieza mucho más tarde, tampoco — a las nueve, «Cierre del día» de las
  // 20:30 no es el siguiente paso de nadie.
  //
  // Orden: lo que está EN CURSO, luego lo que no tiene hora (por su posición),
  // luego lo que viene (por hora de inicio). Lo que está en curso primero porque
  // es lo único que caduca si se deja para después.
  function momento(r: RutinaDelRitual): { grupo: number; clave: number } | null {
    if (!r.bloque) return { grupo: 1, clave: r.position };
    const { inicioMin, finMin } = r.bloque;
    if (finMin <= e.ahoraMin) return null;
    if (inicioMin <= e.ahoraMin) return { grupo: 0, clave: inicioMin };
    if (inicioMin - e.ahoraMin <= HORIZONTE_RUTINA_MIN) return { grupo: 2, clave: inicioMin };
    return null;
  }

  const rutinas = e.rutinas
    .filter((r) => r.active && r.due)
    .map((r) => ({ r, m: momento(r) }))
    .filter((x): x is { r: RutinaDelRitual; m: { grupo: number; clave: number } } => x.m !== null)
    .sort((a, b) => a.m.grupo - b.m.grupo || a.m.clave - b.m.clave || a.r.position - b.r.position)
    .map((x) => x.r);

  for (const r of rutinas) {
    for (const h of r.habits.slice().sort((a, b) => a.position - b.position)) {
      // Un hábito con registro de hoy —hecho, omitido o pospuesto— no genera
      // paso: la persona ya dijo algo sobre él, y volver a preguntárselo trata
      // su respuesta como si no hubiera existido.
      if (h.registradoHoy) continue;
      pendientes.push({
        kind: "routineStep",
        routineId: r.id,
        routineName: r.name,
        habit: { id: h.id, name: h.name, durationMin: h.durationMin, cue: h.cue, twoMinVersion: h.twoMinVersion }
      });
    }
  }

  // El tope existe para que una rutina de veinte hábitos no convierta el
  // arranque en la pantalla de rutinas con otra tipografía.
  return pendientes.slice(0, e.settings.maxRoutineSteps);
}

/**
 * Construye la secuencia del día.
 *
 * NINGÚN PASO SALE DE UNA LISTA FIJA: cada uno existe si y solo si su dato
 * existe. Un brief del respaldo, que no trae mantra ni acción, produce una
 * secuencia sin esos dos pasos — y eso es correcto, no un hueco que rellenar.
 */
export function construirSecuencia(e: EntradaSecuencia): PasoRitual[] {
  const permitidos = new Set<string>(e.settings.steps);
  const pasos: PasoRitual[] = [];

  // Se recorre `PASOS_RITUAL` y no `settings.steps`: así el orden es SIEMPRE el
  // narrativo, aunque el administrador haya guardado el array revuelto.
  for (const tipo of PASOS_RITUAL) {
    if (!permitidos.has(tipo)) continue;

    switch (tipo) {
      case "greeting":
        pasos.push({ kind: "greeting", saludo: greetingFor(e.hourLocal), nombre: e.nombre, dateISO: e.dateISO });
        break;

      case "affirmation":
        if (e.brief && e.brief.affirmations.length > 0) {
          pasos.push({ kind: "affirmation", items: e.brief.affirmations });
        }
        break;

      case "mantra":
        if (e.brief?.mantra) pasos.push({ kind: "mantra", texto: e.brief.mantra });
        break;

      case "visualization":
        // Con `steps` vacío no hay nada que reproducir, y un reproductor sin
        // pasos se queda colgado en el primer segundo.
        if (e.brief?.visualization && e.brief.visualization.steps.length > 0) {
          pasos.push({
            kind: "visualization",
            titulo: e.brief.visualization.title,
            durationMin: e.brief.visualization.durationMin,
            steps: e.brief.visualization.steps
          });
        }
        break;

      case "dailyAction":
        if (e.brief?.dailyAction) {
          pasos.push({ kind: "dailyAction", briefId: e.brief.id, texto: e.brief.dailyAction.text, hecha: e.brief.dailyAction.done });
        }
        break;

      case "routineStep":
        pasos.push(...pasosDeRutina(e));
        break;

      case "context":
        if (e.contexto.length > 0) pasos.push({ kind: "context", hechos: e.contexto });
        break;

      case "planToday":
        if (e.plan && (e.plan.oneThing || e.plan.tareas.length > 0)) {
          pasos.push({ kind: "planToday", oneThing: e.plan.oneThing, tareas: e.plan.tareas });
        }
        break;

      case "closing":
        pasos.push({ kind: "closing", frase: FRASE_DE_CIERRE });
        break;
    }
  }

  return pasos;
}

/**
 * ¿Hay algo que enseñar, de verdad?
 *
 * El saludo y el cierre no cuentan. Un día sin hábitos pendientes, sin brief y
 * sin tareas produce «Buenos días, Luis» y «¿Qué quieres hacer hoy?», que es una
 * pantalla vacía con tipografía grande. Que eso devuelva `false` es el motivo de
 * que esta función exista.
 */
export function hayContenido(pasos: PasoRitual[]): boolean {
  return pasos.some((p) => !PASOS_DE_MARCO.includes(p.kind));
}

/** El índice siguiente, o `null` si ya no hay. Un índice imposible también es `null`. */
export function pasoSiguiente(pasos: PasoRitual[], indice: number): number | null {
  const siguiente = indice + 1;
  return siguiente >= 0 && siguiente < pasos.length ? siguiente : null;
}

/** Cuenta desde uno, que es como lo lee una persona. */
export function progreso(pasos: PasoRitual[], indice: number): { actual: number; total: number; pct: number } {
  const total = pasos.length;
  if (total === 0) return { actual: 0, total: 0, pct: 0 };
  const actual = Math.min(Math.max(indice + 1, 1), total);
  return { actual, total, pct: Math.round((actual / total) * 100) };
}
