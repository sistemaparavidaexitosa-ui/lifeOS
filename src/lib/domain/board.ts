// Lógica pura del tablero de proyectos (Execution OS), estilo monday.com /
// ClickUp: filtros, orden, estadísticas y cálculo de la línea de tiempo.
//
// Se mantiene framework-agnostic (sin Next/React/Supabase) para poder
// probarse con `node --experimental-strip-types --test`, igual que el resto
// de src/lib/domain/*. Toda la UI de /execution (BoardShell, MondayBoard,
// KanbanBoard, TableView, TimelineView) consume ESTAS funciones — así el
// mismo filtro/orden/estadística aplica idéntico en las 4 vistas y no hay
// tres implementaciones distintas de "¿esta tarea está vencida?".
import type { TaskStatus, Priority } from "./types.ts";

// ---------------------------------------------------------------------------
// Modelo mínimo que necesita el tablero
// ---------------------------------------------------------------------------

export interface BoardTaskLike {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  urgent: boolean;
  due: string | null;
  startDate: string | null;
  parentTaskId: string | null;
  groupId: string | null;
  position: number;
}

/** Estados que NO cuentan como trabajo vivo (ni pendiente ni completado). */
export const CLOSED_STATUSES: TaskStatus[] = ["Completed", "Cancelled"];

export function isDone(status: TaskStatus): boolean {
  return status === "Completed";
}

export function isOpen(status: TaskStatus): boolean {
  return !CLOSED_STATUSES.includes(status);
}

/**
 * Fechas: la fuente única es src/lib/domain/datetime.ts. `todayISO()` aquí
 * sigue existiendo para el CLIENTE (usa la zona del navegador), pero el
 * servidor debe pasar el "hoy" del perfil — ver getUserTimeZone().
 */
export { addDaysISO, diffDays } from "./datetime.ts";
import { addDaysISO, diffDays } from "./datetime.ts";

/** "Hoy" según el navegador. En servidor usa todayInTimeZone(profile.timezone). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Una tarea abierta con `due` anterior a hoy está vencida (BR: Overdue). */
export function isOverdue(task: Pick<BoardTaskLike, "due" | "status">, today: string): boolean {
  if (!task.due || !isOpen(task.status)) return false;
  return diffDays(today, task.due) < 0;
}

// ---------------------------------------------------------------------------
// Filtros (barra de herramientas del tablero)
// ---------------------------------------------------------------------------

export type DateBucket = "all" | "overdue" | "today" | "week" | "nodate";

export interface BoardFilters {
  text: string;
  statuses: TaskStatus[];
  priorities: Priority[];
  people: string[];
  date: DateBucket;
  /** Oculta las tareas cerradas (Completed/Cancelled) — "solo trabajo vivo". */
  hideDone: boolean;
}

export const EMPTY_FILTERS: BoardFilters = {
  text: "",
  statuses: [],
  priorities: [],
  people: [],
  date: "all",
  hideDone: false
};

export function activeFilterCount(f: BoardFilters): number {
  return (
    (f.text.trim() ? 1 : 0) +
    (f.statuses.length ? 1 : 0) +
    (f.priorities.length ? 1 : 0) +
    (f.people.length ? 1 : 0) +
    (f.date !== "all" ? 1 : 0) +
    (f.hideDone ? 1 : 0)
  );
}

function matchesDate(task: BoardTaskLike, bucket: DateBucket, today: string): boolean {
  if (bucket === "all") return true;
  if (bucket === "nodate") return !task.due && !task.startDate;
  if (!task.due) return false;
  const delta = diffDays(today, task.due);
  if (bucket === "overdue") return delta < 0 && isOpen(task.status);
  if (bucket === "today") return delta === 0;
  if (bucket === "week") return delta >= 0 && delta <= 7;
  return true;
}

/** ¿La tarea, por sí misma, pasa todos los filtros activos? */
export function matchesFilters(
  task: BoardTaskLike,
  filters: BoardFilters,
  ctx: { assigneesByTask: Record<string, string[]>; today: string }
): boolean {
  const text = filters.text.trim().toLowerCase();
  if (text && !task.title.toLowerCase().includes(text)) return false;
  if (filters.statuses.length && !filters.statuses.includes(task.status)) return false;
  if (filters.priorities.length && !filters.priorities.includes(task.priority)) return false;
  if (filters.hideDone && !isOpen(task.status)) return false;
  if (filters.people.length) {
    const names = ctx.assigneesByTask[task.id] ?? [];
    if (!filters.people.some((p) => names.includes(p))) return false;
  }
  if (!matchesDate(task, filters.date, ctx.today)) return false;
  return true;
}

/**
 * Filtra conservando la jerarquía: si una SUBTAREA coincide, su cadena de
 * ancestros se conserva (aunque los padres no coincidan) para que el usuario
 * vea el contexto — mismo comportamiento que el filtro de subitems de
 * monday.com. Si un PADRE coincide, sus descendientes se conservan.
 */
export function filterTaskTree<T extends BoardTaskLike>(
  tasks: T[],
  filters: BoardFilters,
  ctx: { assigneesByTask: Record<string, string[]>; today: string }
): T[] {
  if (activeFilterCount(filters) === 0) return tasks;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const childrenOf = new Map<string, T[]>();
  for (const t of tasks) {
    if (!t.parentTaskId) continue;
    const list = childrenOf.get(t.parentTaskId) ?? [];
    list.push(t);
    childrenOf.set(t.parentTaskId, list);
  }

  const keep = new Set<string>();
  const keepWithDescendants = (id: string) => {
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      if (keep.has(current)) continue;
      keep.add(current);
      for (const child of childrenOf.get(current) ?? []) stack.push(child.id);
    }
  };

  for (const t of tasks) {
    if (!matchesFilters(t, filters, ctx)) continue;
    keepWithDescendants(t.id);
    let parentId = t.parentTaskId;
    while (parentId && !keep.has(parentId)) {
      keep.add(parentId);
      parentId = byId.get(parentId)?.parentTaskId ?? null;
    }
  }

  return tasks.filter((t) => keep.has(t.id));
}

// ---------------------------------------------------------------------------
// Orden
// ---------------------------------------------------------------------------

export type SortKey = "manual" | "due" | "priority" | "status" | "title";

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
const STATUS_RANK: Record<TaskStatus, number> = {
  Blocked: 0,
  InProgress: 1,
  Pending: 2,
  Rescheduled: 3,
  Completed: 4,
  Cancelled: 5
};

/** Orden estable. `manual` respeta position (drag&drop) y desempata por id. */
export function sortTasks<T extends BoardTaskLike>(tasks: T[], key: SortKey): T[] {
  const copy = [...tasks];
  copy.sort((a, b) => {
    switch (key) {
      case "due": {
        // Sin fecha siempre al final (nunca "antes de todo", que es el bug
        // clásico de ordenar null como string vacío).
        if (!a.due && !b.due) break;
        if (!a.due) return 1;
        if (!b.due) return -1;
        if (a.due !== b.due) return a.due < b.due ? -1 : 1;
        break;
      }
      case "priority": {
        const d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (d !== 0) return d;
        break;
      }
      case "status": {
        const d = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (d !== 0) return d;
        break;
      }
      case "title": {
        const d = a.title.localeCompare(b.title, "es");
        if (d !== 0) return d;
        break;
      }
      case "manual":
      default:
        break;
    }
    if (a.position !== b.position) return a.position - b.position;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return copy;
}

export type DropMode = "before" | "after";

/**
 * Devuelve el nuevo orden de ids tras soltar `movedId` antes/después de
 * `targetId`. Si `targetId` es null, va al final. Es pura: la UI la usa para
 * el update optimista y manda el MISMO arreglo a reorderTasks (Server Action),
 * así cliente y servidor nunca divergen.
 */
export function reorderIds(ids: string[], movedId: string, targetId: string | null, mode: DropMode = "before"): string[] {
  const without = ids.filter((id) => id !== movedId);
  if (!targetId || targetId === movedId) return [...without, movedId];
  const index = without.indexOf(targetId);
  if (index === -1) return [...without, movedId];
  const at = mode === "before" ? index : index + 1;
  return [...without.slice(0, at), movedId, ...without.slice(at)];
}

/** Siguiente `position` libre de una lista de hermanos. */
export function nextPosition(siblings: { position: number }[]): number {
  return siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1;
}

// ---------------------------------------------------------------------------
// Estadísticas (cabecera del tablero y barra por grupo)
// ---------------------------------------------------------------------------

export interface BoardStats {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  pending: number;
  overdue: number;
  dueSoon: number;
  /** % completado sobre tareas no canceladas. 0 si no hay ninguna. */
  pct: number;
  byStatus: Record<TaskStatus, number>;
}

export function computeStats(tasks: BoardTaskLike[], today: string): BoardStats {
  const byStatus: Record<TaskStatus, number> = {
    Pending: 0,
    InProgress: 0,
    Blocked: 0,
    Rescheduled: 0,
    Completed: 0,
    Cancelled: 0
  };
  let overdue = 0;
  let dueSoon = 0;
  for (const t of tasks) {
    byStatus[t.status] += 1;
    if (isOverdue(t, today)) overdue += 1;
    else if (t.due && isOpen(t.status)) {
      const delta = diffDays(today, t.due);
      if (delta >= 0 && delta <= 3) dueSoon += 1;
    }
  }
  const countable = tasks.filter((t) => t.status !== "Cancelled").length;
  return {
    total: tasks.length,
    done: byStatus.Completed,
    inProgress: byStatus.InProgress,
    blocked: byStatus.Blocked,
    pending: byStatus.Pending + byStatus.Rescheduled,
    overdue,
    dueSoon,
    pct: countable ? Math.round((byStatus.Completed / countable) * 100) : 0,
    byStatus
  };
}

// ---------------------------------------------------------------------------
// Timeline (vista Gantt ligera)
// ---------------------------------------------------------------------------

export interface TimelineRange {
  start: string;
  end: string;
  days: number;
}

export interface TimelineBar {
  start: string;
  end: string;
  /** % desde el inicio del rango (0-100). */
  offsetPct: number;
  /** % de ancho del rango (siempre > 0). */
  widthPct: number;
}

/**
 * Rango que cubre todas las fechas del proyecto, con un colchón de 3 días a
 * cada lado y un mínimo de 21 días para que las barras nunca se vean como
 * una sola columna. Siempre incluye "hoy" (para poder dibujar la línea de
 * hoy aunque el proyecto esté todo en el pasado o todo en el futuro).
 */
export function timelineRange(tasks: BoardTaskLike[], today: string): TimelineRange {
  const dates: string[] = [today];
  for (const t of tasks) {
    if (t.startDate) dates.push(t.startDate);
    if (t.due) dates.push(t.due);
  }
  dates.sort();
  let start = addDaysISO(dates[0]!, -3);
  let end = addDaysISO(dates[dates.length - 1]!, 3);
  let days = diffDays(start, end) + 1;
  if (days < 21) {
    const missing = 21 - days;
    start = addDaysISO(start, -Math.floor(missing / 2));
    end = addDaysISO(end, Math.ceil(missing / 2));
    days = diffDays(start, end) + 1;
  }
  return { start, end, days };
}

/**
 * Barra de una tarea dentro del rango. Una tarea con solo `due` se dibuja
 * como un hito de 1 día; una sin fechas devuelve null (se lista aparte).
 */
export function timelineBar(task: BoardTaskLike, range: TimelineRange): TimelineBar | null {
  const start = task.startDate ?? task.due;
  const end = task.due ?? task.startDate;
  if (!start || !end) return null;
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  const offsetDays = Math.max(0, diffDays(range.start, from));
  const spanDays = Math.max(1, Math.min(diffDays(from, to) + 1, range.days - offsetDays));
  return {
    start: from,
    end: to,
    offsetPct: (offsetDays / range.days) * 100,
    widthPct: (spanDays / range.days) * 100
  };
}

// ---------------------------------------------------------------------------
// Jerarquía (guardas de drag&drop)
// ---------------------------------------------------------------------------

/**
 * ¿`candidateId` está dentro del subárbol de `taskId`? Se usa ANTES de
 * anidar una tarea por drag&drop, para impedir que una tarea termine siendo
 * su propio ancestro (arrastrar un padre dentro de su hijo).
 */
export function isDescendantOf(tasks: BoardTaskLike[], taskId: string, candidateId: string): boolean {
  if (taskId === candidateId) return true;
  const childrenOf = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.parentTaskId) continue;
    const list = childrenOf.get(t.parentTaskId) ?? [];
    list.push(t.id);
    childrenOf.set(t.parentTaskId, list);
  }
  const stack = [...(childrenOf.get(taskId) ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === candidateId) return true;
    if (seen.has(current)) continue; // defensa ante datos corruptos con ciclos
    seen.add(current);
    stack.push(...(childrenOf.get(current) ?? []));
  }
  return false;
}

/** Ids de una tarea y TODOS sus descendientes (borrado en cascada optimista). */
export function subtreeIds(tasks: BoardTaskLike[], taskId: string): string[] {
  const ids = new Set<string>([taskId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks) {
      if (t.parentTaskId && ids.has(t.parentTaskId) && !ids.has(t.id)) {
        ids.add(t.id);
        grew = true;
      }
    }
  }
  return [...ids];
}
