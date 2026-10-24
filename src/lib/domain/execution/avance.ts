// El toque en el círculo de una tarea: avanzar UN paso por el camino feliz.
//
// La máquina de estados (task-state.ts) no deja saltar de «Sin empezar» a
// «Hecho», y lo hecho ya no vuelve. Así que el círculo no es una casilla de
// verificación: es «siguiente paso». Sin empezar → Trabajando → Hecho. Lo
// bloqueado vuelve a trabajarse y lo reprogramado vuelve a la fila. Lo cerrado
// no tiene paso siguiente.
//
// El servidor sigue validando cada transición; esto solo elige cuál pedir.

import { TASK_TRANSITIONS, canTransition } from "../task-state.ts";
import type { TaskStatus } from "../types.ts";

const SIGUIENTE: Partial<Record<TaskStatus, TaskStatus>> = {
  Pending: "InProgress",
  InProgress: "Completed",
  Blocked: "InProgress",
  Rescheduled: "Pending"
};

export function siguientePaso(estado: TaskStatus): TaskStatus | null {
  const to = SIGUIENTE[estado];
  // Defensa: si alguien cambia la tabla de transiciones, el círculo deja de
  // proponer un paso que el servidor rechazaría.
  return to && canTransition(estado, to) ? to : null;
}

/** Texto del aviso tras avanzar: lo que acaba de pasar, en una palabra. */
export function textoDelPaso(to: TaskStatus): string {
  switch (to) {
    case "InProgress":
      return "En curso";
    case "Completed":
      return "Hecha";
    case "Pending":
      return "De vuelta en la fila";
    default:
      return "Actualizada";
  }
}

/**
 * Los pasos para llevar una tarea de `desde` a `hasta` por transiciones
 * válidas, el camino más corto. Cerrar una tarea principal desde «Sin
 * empezar» es [Trabajando, Hecho]: el servidor no deja saltar. Vacío si ya
 * está ahí; null si no hay camino (lo cerrado no vuelve).
 */
export function caminoA(desde: TaskStatus, hasta: TaskStatus): TaskStatus[] | null {
  if (desde === hasta) return [];
  const previo = new Map<TaskStatus, TaskStatus>();
  const cola: TaskStatus[] = [desde];
  while (cola.length) {
    const actual = cola.shift()!;
    for (const siguiente of TASK_TRANSITIONS[actual]) {
      if (siguiente === desde || previo.has(siguiente)) continue;
      previo.set(siguiente, actual);
      if (siguiente === hasta) {
        const camino: TaskStatus[] = [];
        for (let x: TaskStatus | undefined = hasta; x && x !== desde; x = previo.get(x)) camino.unshift(x);
        return camino;
      }
      cola.push(siguiente);
    }
  }
  return null;
}
