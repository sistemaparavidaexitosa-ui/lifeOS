"use client";
// Cerebro del tablero de un proyecto (rediseño estilo monday.com / ClickUp).
//
// QUÉ CAMBIA RESPECTO AL DISEÑO ANTERIOR
//   - Antes cada vista (MondayBoard, KanbanBoard, TreeView) era una isla con
//     su PROPIO estado, sus propias Server Actions y sus propios datos; para
//     cambiar de vista había que navegar (?view=), lo que recargaba la página
//     y perdía filtros, selección y scroll.
//   - Ahora BoardShell es el único dueño del estado del proyecto (tareas,
//     grupos, responsables, selección, filtros, orden y vista). Las vistas
//     son presentación: reciben datos ya filtrados/ordenados y el objeto
//     `api` (board-types.ts) para mutar. Cambiar de vista es instantáneo y
//     conserva todo el contexto; la URL se sincroniza con history.replaceState
//     para que el enlace siga siendo compartible.
//
// Toda la lógica pura (filtrar, ordenar, estadísticas, reordenar, guardas de
// jerarquía) vive en src/lib/domain/board.ts y está cubierta por
// tests/domain/board.test.ts — este archivo solo orquesta.
import { useCallback, useMemo, useState } from "react";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  computeStats,
  filterTaskTree,
  sortTasks,
  subtreeIds,
  type BoardFilters,
  type SortKey
} from "@/lib/domain/board.ts";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";
import type { BoardApi, BoardGroup, BoardTask, ExecutionView, MoveTarget } from "./board-types";
import { VIEW_LABELS } from "./board-types";
import BoardToolbar from "./BoardToolbar";
import BulkActionBar from "./BulkActionBar";
import MondayBoard from "./MondayBoard";
import KanbanBoard from "./KanbanBoard";
import TableView from "./TableView";
import TimelineView from "./TimelineView";
import TaskDetailPanel from "./TaskDetailPanel";
import { deleteTask as deleteTaskAction } from "./actions";
import { moveTaskToGroup, reorderTasks, setTaskPriority } from "./board-actions";
import { setTaskParent } from "./tree-actions";

export default function BoardShell({
  projectId,
  initialTasks,
  initialGroups,
  initialAssignees,
  commentCountByTask,
  members,
  initialView,
  orderingEnabled,
  today
}: {
  projectId: string;
  initialTasks: BoardTask[];
  initialGroups: BoardGroup[];
  initialAssignees: Record<string, string[]>;
  commentCountByTask: Record<string, number>;
  members: string[];
  initialView: ExecutionView;
  orderingEnabled: boolean;
  /** "Hoy" en la zona horaria del PERFIL, calculado en el servidor. */
  today: string;
}) {
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks);
  const [groups, setGroups] = useState<BoardGroup[]>(initialGroups);
  const [assigneesByTask, setAssigneesByTask] = useState(initialAssignees);
  const [view, setView] = useState<ExecutionView>(initialView);
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("manual");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nota: page.tsx monta este componente con key={projectId}, así que cambiar
  // de tablero lo remonta con estado limpio — no hace falta ningún efecto de
  // sincronización (que además pisaría los updates optimistas en curso).

  function changeView(next: ExecutionView) {
    setView(next);
    // La vista deja de ser una navegación (no recarga el Server Component),
    // pero la URL debe seguir describiendo lo que se ve para poder compartirla.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  const filteredTasks = useMemo(
    () => filterTaskTree(tasks, filters, { assigneesByTask, today }),
    [tasks, filters, assigneesByTask, today]
  );

  const stats = useMemo(() => computeStats(tasks, today), [tasks, today]);
  const filteredStats = useMemo(() => computeStats(filteredTasks, today), [filteredTasks, today]);
  const filtersActive = activeFilterCount(filters) > 0;

  /** Hermanos de una tarea (misma lista de orden): raíz de un grupo o subtareas de un padre. */
  const siblingsOf = useCallback(
    (target: MoveTarget, source: BoardTask[] = tasks) =>
      sortTasks(
        source.filter((t) =>
          target.parentTaskId ? t.parentTaskId === target.parentTaskId : !t.parentTaskId && t.groupId === target.groupId
        ),
        "manual"
      ),
    [tasks]
  );

  const patchTask = useCallback((id: string, patch: Partial<BoardTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const toggleSelected = useCallback((id: string, next?: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      const shouldSelect = next ?? !copy.has(id);
      if (shouldSelect) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }, []);

  const selectMany = useCallback((ids: string[], next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      for (const id of ids) {
        if (next) copy.add(id);
        else copy.delete(id);
      }
      return copy;
    });
  }, []);

  const deleteTask = useCallback(
    (id: string) => {
      const removing = new Set(subtreeIds(tasks, id));
      const snapshot = tasks;
      setTasks((prev) => prev.filter((t) => !removing.has(t.id)));
      setSelected((prev) => new Set([...prev].filter((s) => !removing.has(s))));
      setError(null);
      deleteTaskAction(id).catch((e) => {
        setTasks(snapshot); // el servidor rechazó el borrado: se revierte
        setError(e instanceof Error ? e.message : "No se pudo eliminar la tarea");
      });
    },
    [tasks]
  );

  const moveTask = useCallback(
    (taskId: string, target: MoveTarget, orderedIds: string[]) => {
      const moved = tasks.find((t) => t.id === taskId);
      if (!moved) return;
      const snapshot = tasks;
      const groupId = target.parentTaskId
        ? (tasks.find((t) => t.id === target.parentTaskId)?.groupId ?? moved.groupId)
        : target.groupId;

      setTasks((prev) =>
        prev.map((t) => {
          const positionIndex = orderedIds.indexOf(t.id);
          const base = positionIndex === -1 ? t : { ...t, position: positionIndex };
          if (t.id !== taskId) return base;
          return { ...base, groupId, parentTaskId: target.parentTaskId };
        })
      );
      setError(null);

      const parentChanged = moved.parentTaskId !== target.parentTaskId;
      const groupChanged = moved.groupId !== groupId;
      const persist = async () => {
        if (target.parentTaskId) {
          // Anidar: setTaskParent hace que la tarea herede el grupo del padre.
          await setTaskParent(taskId, target.parentTaskId);
          if (orderingEnabled) await reorderTasks(projectId, orderedIds);
        } else if ((groupChanged || parentChanged) && target.groupId) {
          // Soltar en la raíz de un grupo: una sola Action fija grupo, quita
          // el padre y persiste el orden de la lista destino.
          await moveTaskToGroup({ taskId, groupId: target.groupId, projectId, orderedIds });
        } else if (parentChanged) {
          await setTaskParent(taskId, null);
          if (orderingEnabled) await reorderTasks(projectId, orderedIds);
        } else if (orderingEnabled) {
          await reorderTasks(projectId, orderedIds);
        }
      };
      persist().catch((e) => {
        setTasks(snapshot);
        setError(e instanceof Error ? e.message : "No se pudo mover la tarea");
      });
    },
    [tasks, projectId, orderingEnabled]
  );

  const api: BoardApi = useMemo(
    () => ({
      projectId,
      today,
      members,
      assigneesByTask,
      commentCountByTask,
      groups,
      orderingEnabled: orderingEnabled && sort === "manual" && !filtersActive,
      selected,
      toggleSelected,
      selectMany,
      clearSelection: () => setSelected(new Set()),
      patchTask,
      setStatus: (id, status: TaskStatus) => patchTask(id, { status }),
      setPriority: (id, priority: Priority, urgent: boolean) => {
        const previous = tasks.find((t) => t.id === id);
        patchTask(id, { priority, urgent });
        setTaskPriority(id, priority, urgent).catch((e) => {
          if (previous) patchTask(id, { priority: previous.priority, urgent: previous.urgent });
          setError(e instanceof Error ? e.message : "No se pudo cambiar la prioridad");
        });
      },
      setAssignees: (id, names) => setAssigneesByTask((prev) => ({ ...prev, [id]: names })),
      taskCreated: (task) => setTasks((prev) => [...prev, task]),
      deleteTask,
      moveTask,
      openDetail: (taskId) => setDetailTaskId(taskId),
      reportError: setError
    }),
    [
      projectId,
      today,
      members,
      assigneesByTask,
      commentCountByTask,
      groups,
      orderingEnabled,
      sort,
      filtersActive,
      selected,
      toggleSelected,
      selectMany,
      patchTask,
      deleteTask,
      moveTask,
      tasks
    ]
  );

  const detailTask = detailTaskId ? tasks.find((t) => t.id === detailTaskId) : null;

  return (
    <div className="ex-board">
      <BoardToolbar
        view={view}
        onViewChange={changeView}
        filters={filters}
        onFiltersChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        members={members}
        filtersActive={filtersActive}
      />

      {error && (
        <div className="ex-alert" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setError(null)}>
            Cerrar
          </button>
        </div>
      )}

      {!orderingEnabled && (
        <p className="ex-hint">
          El orden manual (arrastrar tareas) está desactivado: falta aplicar la migración{" "}
          <code>0021_execution_board_order.sql</code>.
        </p>
      )}

      {filtersActive && (
        <p className="ex-hint">
          Mostrando {filteredStats.total} de {stats.total} tareas — el orden manual se reactiva al limpiar los filtros.
        </p>
      )}

      {view === "board" && (
        <MondayBoard
          api={api}
          tasks={filteredTasks}
          sort={sort}
          onGroupsChange={setGroups}
          siblingsOf={siblingsOf}
        />
      )}
      {view === "kanban" && <KanbanBoard api={api} tasks={filteredTasks} today={today} />}
      {view === "table" && <TableView api={api} tasks={filteredTasks} sort={sort} onSortChange={setSort} today={today} />}
      {view === "timeline" && <TimelineView api={api} tasks={filteredTasks} today={today} />}

      <BulkActionBar api={api} tasks={tasks} onTasksChange={setTasks} />

      {/* Un solo Drawer de detalle para TODAS las vistas — antes cada vista
          montaba el suyo por fila/tarjeta (hasta N drawers en el DOM). */}
      {detailTask && (
        <TaskDetailPanel
          key={detailTask.id}
          taskId={detailTask.id}
          taskTitle={detailTask.title}
          compact
          open
          onOpenChange={(open) => !open && setDetailTaskId(null)}
        />
      )}

      <p className="ex-viewhint text-xs">
        Vista actual: <b>{VIEW_LABELS[view].label}</b>
        {view === "board" && api.orderingEnabled && " — arrastra una fila para reordenar, suéltala sobre otra tarea para anidarla."}
      </p>
    </div>
  );
}
