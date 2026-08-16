// Metadatos de color/etiqueta por TaskStatus — fuente única de verdad para
// StatusMenu.tsx, MondayRow.tsx y TaskTable.tsx, así el color de un estado es
// siempre el mismo sin importar la vista (Monday/Kanban/Tabla).
import type { TaskStatus } from "@/lib/domain/types.ts";

export interface StatusMeta {
  label: string;
  color: string; // texto/fondo sólido (pill)
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  Pending: { label: "Sin empezar", color: "var(--st-notstarted)" },
  InProgress: { label: "Trabajando", color: "var(--st-working)" },
  Blocked: { label: "Bloqueada", color: "var(--st-stuck)" },
  Rescheduled: { label: "Reprogramada", color: "var(--st-scheduled)" },
  Completed: { label: "Hecho", color: "var(--st-done)" },
  Cancelled: { label: "Cancelada", color: "var(--st-cancelled)" }
};

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  Pending: ["InProgress", "Rescheduled", "Cancelled"],
  InProgress: ["Blocked", "Completed", "Rescheduled"],
  Blocked: ["InProgress", "Cancelled"],
  Rescheduled: ["Pending"],
  Completed: [],
  Cancelled: []
};
