// Metadatos de color/etiqueta por TaskStatus y Priority — fuente única de
// verdad para StatusMenu, PriorityMenu, MondayRow, KanbanBoard, TableView y
// TimelineView: el color de un estado es SIEMPRE el mismo sin importar la
// vista.
import type { TaskStatus, Priority, ProjectStatus } from "@/lib/domain/types.ts";

export interface StatusMeta {
  label: string;
  /** Color sólido (pill del tablero, barra del timeline). */
  color: string;
  /** Fondo suave (tarjeta Kanban, chips de resumen). */
  soft: string;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  Pending: { label: "Sin empezar", color: "var(--st-notstarted)", soft: "var(--st-notstarted-bg)" },
  InProgress: { label: "Trabajando", color: "var(--st-working)", soft: "var(--st-working-bg)" },
  Blocked: { label: "Bloqueada", color: "var(--st-stuck)", soft: "var(--st-stuck-bg)" },
  Rescheduled: { label: "Reprogramada", color: "var(--st-scheduled)", soft: "var(--st-scheduled-bg)" },
  Completed: { label: "Hecho", color: "var(--st-done)", soft: "var(--st-done-bg)" },
  Cancelled: { label: "Cancelada", color: "var(--st-cancelled)", soft: "var(--st-cancelled-bg)" }
};

/** Orden de columnas del Kanban y de los chips de resumen. */
export const STATUS_ORDER: TaskStatus[] = ["Pending", "InProgress", "Blocked", "Rescheduled", "Completed", "Cancelled"];

/**
 * Estado de PROYECTO. Es un enum distinto al de tarea (projects.status admite
 * Draft/OnHold/Archived, que no existen en una tarea), así que tiene su propio
 * mapa en vez de forzar el de tareas: la cartera de proyectos y el tablero de
 * tareas no deben poder contradecirse porque alguien reutilizó una etiqueta.
 */
export const PROJECT_STATUS_META: Record<ProjectStatus, StatusMeta> = {
  Draft: { label: "Borrador", color: "var(--st-notstarted)", soft: "var(--st-notstarted-bg)" },
  Active: { label: "Activo", color: "var(--accent)", soft: "color-mix(in srgb, var(--accent) 16%, transparent)" },
  OnHold: { label: "En pausa", color: "var(--st-working)", soft: "var(--st-working-bg)" },
  Completed: { label: "Completado", color: "var(--st-done)", soft: "var(--st-done-bg)" },
  Cancelled: { label: "Cancelado", color: "var(--st-stuck)", soft: "var(--st-stuck-bg)" },
  Archived: { label: "Archivado", color: "var(--st-cancelled)", soft: "var(--st-cancelled-bg)" }
};

/** Orden del menú de estado de proyecto: el ciclo de vida, no el alfabeto. */
export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "Draft",
  "Active",
  "OnHold",
  "Completed",
  "Cancelled",
  "Archived"
];

/** Estados que cuentan como "en curso" en el filtro de la cartera. */
export const PROJECT_OPEN_STATUSES: ProjectStatus[] = ["Draft", "Active", "OnHold"];

export interface PriorityMeta {
  label: string;
  color: string;
  soft: string;
}

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  High: { label: "Alta", color: "var(--danger)", soft: "var(--st-stuck-bg)" },
  Medium: { label: "Media", color: "var(--warn)", soft: "var(--st-working-bg)" },
  Low: { label: "Baja", color: "var(--info)", soft: "var(--st-scheduled-bg)" }
};

export const PRIORITY_ORDER: Priority[] = ["High", "Medium", "Low"];

/** Paleta de colores de grupo (misma que usa el resto del design system). */
export const GROUP_COLORS = [
  "var(--c-purple)",
  "var(--c-green)",
  "var(--c-orange)",
  "var(--c-pink)",
  "var(--c-teal)",
  "var(--c-blue)",
  "var(--danger)",
  "var(--muted)"
];

/**
 * Transiciones permitidas (re-export de la máquina de estados de dominio).
 * Antes este archivo mantenía su PROPIA copia de la tabla, que podía quedar
 * desincronizada de src/lib/domain/task-state.ts — la fuente real que valida
 * el servidor. Ahora la UI y el servidor leen exactamente la misma tabla.
 */
export { TASK_TRANSITIONS } from "@/lib/domain/task-state.ts";
