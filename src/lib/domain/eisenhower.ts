// Matriz de Eisenhower — FR-VIEW-007/008, FR-EXE-014, BR-023, ADR-013.
// Es una VISTA/PROYECCIÓN sobre `tasks` (urgent + priority); NO es una
// entidad paralela. Ver /docs/DECISIONS.md D-002 y el guardrail explícito en
// el prompt de build: "No crear una tabla eisenhower_cards".

import type { EisenhowerQuadrant, Priority, TaskStatus } from "./types.ts";

export function quadrantOf(task: { urgent: boolean; priority: Priority }): EisenhowerQuadrant {
  const { urgent, priority } = task;
  const important = priority === "High";
  if (urgent && important) return "do";
  if (!urgent && important) return "plan";
  if (urgent && !important) return "delegate";
  return "drop";
}

const QUADRANT_MAP: Record<EisenhowerQuadrant, { urgent: boolean; priority: Priority }> = {
  do: { urgent: true, priority: "High" },
  plan: { urgent: false, priority: "High" },
  delegate: { urgent: true, priority: "Medium" },
  drop: { urgent: false, priority: "Low" }
};

export interface QuadrantChangeResult {
  ok: boolean;
  message?: string;
  urgent?: boolean;
  priority?: Priority;
}

/**
 * BR-023: mover una burbuja actualiza urgent/priority y debe auditarse como
 * un cambio de estado. FR-VIEW-008: una transición inválida (tarea Completed
 * o Cancelled) no debe permitirse.
 */
export function changeQuadrant(
  task: { status: TaskStatus },
  targetQuadrant: EisenhowerQuadrant
): QuadrantChangeResult {
  if (task.status === "Completed" || task.status === "Cancelled") {
    return { ok: false, message: "No se puede reclasificar una tarea en estado terminal." };
  }
  const mapped = QUADRANT_MAP[targetQuadrant];
  if (!mapped) return { ok: false, message: "Cuadrante inválido." };
  return { ok: true, urgent: mapped.urgent, priority: mapped.priority };
}
