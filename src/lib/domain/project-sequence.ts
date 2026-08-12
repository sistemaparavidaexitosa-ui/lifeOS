// Secuenciación de proyecto por IA — FR-INT-011, BR-022, ADR-014.
// Phase 1: heurística DETERMINISTA (orden topológico por dependencias +
// prioridad + estimación). Nunca reordena nada por sí sola — el resultado es
// una sugerencia que requiere `POST /projects/{id}/tasks/reorder` explícito
// del usuario para aplicarse (ver /docs/DECISIONS.md D-004).

import type { Priority, TaskStatus } from "./types.ts";

export interface SequenceTaskInput {
  id: string;
  status: TaskStatus;
  priority: Priority;
  est: number;
  deps: string[];
}

export interface SequenceEvidence {
  type: string;
  label: string;
}

export interface SequenceSuggestion {
  order: string[];
  evidence: SequenceEvidence[];
  assumptions: string[];
  confidence: "Baja" | "Media" | "Alta";
}

const PRIORITY_WEIGHT: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export function suggestProjectSequence(tasksInput: SequenceTaskInput[]): SequenceSuggestion {
  const tasks = tasksInput.filter((t) => t.status !== "Completed" && t.status !== "Cancelled");
  if (tasks.length === 0) {
    return { order: [], evidence: [], assumptions: [], confidence: "Baja" };
  }

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const done = new Set<string>();
  const order: string[] = [];

  while (order.length < tasks.length) {
    const ready = tasks.filter(
      (t) => !done.has(t.id) && t.deps.every((d) => done.has(d) || !byId.has(d))
    );
    if (ready.length === 0) break; // ciclo de dependencias: se resuelve abajo
    ready.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || a.est - b.est);
    const next = ready[0]!;
    order.push(next.id);
    done.add(next.id);
  }
  // Cualquier tarea restante (ciclo de dependencias no resoluble) se anexa al final
  // en vez de perderse — nunca se descarta silenciosamente una tarea.
  for (const t of tasks) {
    if (!done.has(t.id)) order.push(t.id);
  }

  return {
    order,
    evidence: [
      { type: "dependency_graph", label: "Grafo de dependencias del proyecto" },
      { type: "priority_estimate", label: "Prioridad y estimación de cada tarea" }
    ],
    assumptions: [
      "Prioriza tareas sin dependencias abiertas, de mayor prioridad y menor estimación primero.",
      "No reordena tareas ya completadas o canceladas."
    ],
    confidence: tasks.length >= 3 ? "Media" : "Baja"
  };
}
