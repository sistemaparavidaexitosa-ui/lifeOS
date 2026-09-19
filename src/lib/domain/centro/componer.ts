// src/lib/domain/centro/componer.ts
// Qué bloques tiene el centro (D-166). Puro, probado en
// tests/domain/centro-componer.test.ts.

import { construirSecuencia, type EntradaSecuencia } from "../ritual/secuencia.ts";
import type { HechoRitual, PasoRitual } from "../ritual/types.ts";

export type BloqueCentro =
  | { kind: "ahora"; paso: Extract<PasoRitual, { kind: "routineStep" }> }
  | { kind: "dia"; hechos: HechoRitual[] }
  | { kind: "mueve"; oneThing: string };

/**
 * Los pasos que el centro usa para componerse. NO son los de la política del
 * administrador: esa gobierna la secuencia de la mañana, y apagar ahí el paso de
 * contexto no puede dejar sin cifras la pantalla con la que se navega.
 */
const PASOS_DEL_CENTRO = ["routineStep", "context", "planToday"] as const;

/**
 * El centro no es la secuencia, pero se compone llamando a `construirSecuencia`
 * y eso no es un atajo: es lo que le hace heredar gratis las reglas que ya están
 * probadas — la hora que decide qué rutina toca, el hábito con registro de hoy
 * que no se vuelve a pedir, y «ningún bloque sin su dato».
 *
 * `maxRoutineSteps: 1` porque el centro enseña LO SIGUIENTE, una sola cosa. La
 * lista entera vive en Rutinas, a un clic de aquí.
 */
export function componerCentro(e: EntradaSecuencia): BloqueCentro[] {
  const pasos = construirSecuencia({
    ...e,
    settings: { ...e.settings, steps: [...PASOS_DEL_CENTRO], maxRoutineSteps: 1 }
  });

  const bloques: BloqueCentro[] = [];
  for (const paso of pasos) {
    if (paso.kind === "routineStep") bloques.push({ kind: "ahora", paso });
    else if (paso.kind === "context") bloques.push({ kind: "dia", hechos: paso.hechos });
    // Solo la Única Cosa: las tareas de impacto ya tienen su pantalla, y el
    // centro pregunta «¿qué mueve el día?», no «¿qué tienes pendiente?».
    else if (paso.kind === "planToday" && paso.oneThing) bloques.push({ kind: "mueve", oneThing: paso.oneThing });
  }
  return bloques;
}
