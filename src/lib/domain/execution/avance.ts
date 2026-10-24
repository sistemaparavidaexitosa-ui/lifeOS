// El toque en el círculo de una tarea: avanzar UN paso por el camino feliz.
//
// La máquina de estados (task-state.ts) no deja saltar de «Sin empezar» a
// «Hecho», y lo hecho ya no vuelve. Así que el círculo no es una casilla de
// verificación: es «siguiente paso». Sin empezar → Trabajando → Hecho. Lo
// bloqueado vuelve a trabajarse y lo reprogramado vuelve a la fila. Lo cerrado
// no tiene paso siguiente.
//
// El servidor sigue validando cada transición; esto solo elige cuál pedir.

import { canTransition } from "../task-state.ts";
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
