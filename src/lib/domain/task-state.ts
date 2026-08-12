// Máquina de estados de Task — Master Spec §42, FR-EXE-003/004/005, BR-005/006.
// Puerto directo de DOMAIN.taskTransitions / setTaskStatus del HTML de
// referencia, sin efectos secundarios (el llamador decide cómo persistir).

import type { TaskLike, TaskStatus, EffectiveTaskStatus } from "./types.ts";

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  Pending: ["InProgress", "Rescheduled", "Cancelled"],
  InProgress: ["Blocked", "Completed", "Rescheduled"],
  Blocked: ["InProgress", "Cancelled"],
  Rescheduled: ["Pending"],
  Completed: [],
  Cancelled: []
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

/** BR-006: Overdue es un estado DERIVADO, nunca se persiste como status fuente. */
export function isOverdue(task: Pick<TaskLike, "status" | "due">, todayISO: string): boolean {
  return task.status !== "Completed" && task.status !== "Cancelled" && !!task.due && task.due < todayISO;
}

export function effectiveStatus(task: Pick<TaskLike, "status" | "due">, todayISO: string): EffectiveTaskStatus {
  return isOverdue(task, todayISO) ? "Overdue" : task.status;
}

export interface TransitionResult {
  ok: boolean;
  message?: string;
}

/**
 * FR-EXE-005: una tarea no puede completarse con dependencias abiertas.
 * `depStatuses` es el status actual de cada dependencia declarada en `deps`.
 */
export function evaluateTransition(
  task: Pick<TaskLike, "status" | "deps">,
  to: TaskStatus,
  depStatuses: Record<string, TaskStatus>
): TransitionResult {
  if (task.status === to) return { ok: true };
  if (!canTransition(task.status, to)) {
    return { ok: false, message: `Transición no permitida: ${task.status} → ${to}` };
  }
  if (to === "Completed") {
    const openDeps = task.deps.filter((id) => depStatuses[id] && depStatuses[id] !== "Completed");
    if (openDeps.length > 0) {
      return { ok: false, message: `Faltan dependencias: ${openDeps.join(", ")}` };
    }
  }
  return { ok: true };
}
