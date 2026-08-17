// FASE 4 (Tree View). Lógica pura de árbol de tareas, extraída como módulo
// compartido para NO duplicar la construcción de childrenMap que ya existe
// de forma inline en MondayBoard.tsx. Si más adelante refactorizas
// MondayBoard.tsx para importar buildChildrenMap desde aquí en vez de
// recalcularlo inline, tendrás una única fuente de verdad (recomendado,
// no obligatorio para que Fase 4 funcione hoy).
import type { TaskStatus } from "./types.ts";

export interface TreeTaskLike {
  id: string;
  parent_task_id: string | null;
  group_id: string | null;
  status: TaskStatus | string;
  [key: string]: unknown;
}

/**
 * Ajusta esta condición si tu estado "completado" usa otro string distinto
 * de "Done" (revisa las opciones reales de src/lib/domain/status-meta.ts o
 * el enum de TaskStatus). Se centraliza aquí a propósito para que sea un
 * único punto de ajuste si el nombre difiere.
 */
export function isDoneStatus(status: string): boolean {
  return status.toLowerCase() === "done";
}

/** Agrupa tareas por parent_task_id (null = raíz). Reutilizable por cualquier vista en árbol. */
export function buildChildrenMap<T extends TreeTaskLike>(tasks: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const t of tasks) {
    const key = t.parent_task_id ?? "__root__";
    if (!map[key]) map[key] = [];
    map[key].push(t);
  }
  return map;
}

/**
 * Guarda contra ciclos: ¿candidateAncestorId es descendiente de taskId?
 * Úsalo ANTES de reparentar por drag&drop — evita que una tarea termine
 * siendo su propio ancestro (ej. arrastrar un padre dentro de su hijo).
 */
export function isDescendant<T extends TreeTaskLike>(
  childrenMap: Record<string, T[]>,
  taskId: string,
  candidateAncestorId: string
): boolean {
  const stack = [...(childrenMap[taskId] ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.id === candidateAncestorId) return true;
    stack.push(...(childrenMap[node.id] ?? []));
  }
  return false;
}

export interface ProgressCount {
  total: number;
  done: number;
}

/** Cuenta TODOS los descendientes (no incluye el nodo mismo) y cuántos están "Done". */
export function countDescendantProgress<T extends TreeTaskLike>(
  childrenMap: Record<string, T[]>,
  taskId: string
): ProgressCount {
  let total = 0;
  let done = 0;
  const stack = [...(childrenMap[taskId] ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    total += 1;
    if (isDoneStatus(String(node.status))) done += 1;
    stack.push(...(childrenMap[node.id] ?? []));
  }
  return { total, done };
}

/** Cuenta TODAS las tareas de un grupo (todas las profundidades) y cuántas están "Done". */
export function countGroupProgress<T extends TreeTaskLike>(tasks: T[], groupId: string): ProgressCount {
  const inGroup = tasks.filter((t) => t.group_id === groupId);
  return {
    total: inGroup.length,
    done: inGroup.filter((t) => isDoneStatus(String(t.status))).length
  };
}
