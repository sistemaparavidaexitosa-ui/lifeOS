// Tipos compartidos por TODAS las vistas del tablero (Tablero, Kanban,
// Tabla, Timeline) y por BoardShell, que es quien mantiene el estado.
//
// Antes cada vista definía su propia interfaz (MondayTask, KanbanTask,
// TableTask, TreeNodeTask) con subconjuntos distintos de las mismas
// columnas, y page.tsx mapeaba la fila de Supabase 4 veces. Ahora hay UN
// solo modelo de tarea de tablero y las vistas son funciones de ese modelo.
import type { BoardTaskLike } from "@/lib/domain/board.ts";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";

export interface BoardTask extends BoardTaskLike {
  est: number;
}

export interface BoardGroup {
  id: string;
  name: string;
  color: string;
  position: number;
}

export type ExecutionView = "board" | "kanban" | "table" | "timeline" | "hilo";

export const VIEW_LABELS: Record<ExecutionView, { label: string; icon: string }> = {
  board: { label: "Tablero", icon: "📋" },
  kanban: { label: "Kanban", icon: "🗂️" },
  table: { label: "Tabla", icon: "📑" },
  timeline: { label: "Timeline", icon: "📆" },
  hilo: { label: "Hilo", icon: "💬" }
};

export function isExecutionView(value: string | undefined): value is ExecutionView {
  return value === "board" || value === "kanban" || value === "table" || value === "timeline" || value === "hilo";
}

/**
 * Las vistas del tablero, sin el hilo.
 *
 * «Hilo» solo tiene sentido donde hay alguien más: en el espacio personal no
 * hay a quién mencionar ni con quién conversar. Se ofrece una lista y no se
 * recorren las claves de VIEW_LABELS para que esa condición viva en UN sitio
 * —quien monta el tablero— y no repartida por la barra de pestañas.
 */
export const VIEWS_SIN_HILO: ExecutionView[] = ["board", "kanban", "table", "timeline"];
export const VIEWS_CON_HILO: ExecutionView[] = [...VIEWS_SIN_HILO, "hilo"];

/** Destino de un arrastre: grupo y/o padre nuevos para la tarea movida. */
export interface MoveTarget {
  groupId: string | null;
  parentTaskId: string | null;
}

/**
 * Handlers que BoardShell entrega a las vistas. Todas las vistas mutan el
 * MISMO estado a través de esta interfaz — por eso cambiar de vista nunca
 * pierde un cambio ni exige recargar.
 */
export interface BoardApi {
  projectId: string;
  /** "Hoy" en la zona horaria del perfil (viene del servidor, ver page.tsx). */
  today: string;
  members: string[];
  assigneesByTask: Record<string, string[]>;
  commentCountByTask: Record<string, number>;
  groups: BoardGroup[];
  /** false cuando la migración 0021 aún no está aplicada: el orden manual se desactiva. */
  orderingEnabled: boolean;
  selected: Set<string>;
  toggleSelected: (id: string, selected?: boolean) => void;
  selectMany: (ids: string[], selected: boolean) => void;
  clearSelection: () => void;
  patchTask: (id: string, patch: Partial<BoardTask>) => void;
  setStatus: (id: string, status: TaskStatus) => void;
  setPriority: (id: string, priority: Priority, urgent: boolean) => void;
  setAssignees: (id: string, names: string[]) => void;
  taskCreated: (task: BoardTask) => void;
  deleteTask: (id: string) => void;
  /** Mueve una tarea de grupo/padre y persiste el nuevo orden de la lista destino. */
  moveTask: (taskId: string, target: MoveTarget, orderedIds: string[]) => void;
  openDetail: (taskId: string) => void;
  reportError: (message: string | null) => void;
}
