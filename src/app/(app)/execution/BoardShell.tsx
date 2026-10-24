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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { siguientePaso, textoDelPaso } from "@/lib/domain/execution/avance.ts";
import type { BoardApi, BoardGroup, BoardTask, ExecutionView, MoveTarget } from "./board-types";
import { VIEWS_CON_HILO, VIEWS_SIN_HILO } from "./board-types";
import BoardToolbar from "./BoardToolbar";
import BulkActionBar from "./BulkActionBar";
import MondayBoard from "./MondayBoard";
import LinearList from "./LinearList";
import KanbanBoard from "./KanbanBoard";
import TableView from "./TableView";
import TimelineView from "./TimelineView";
import TaskSheet from "./TaskSheet";
import ProjectThreadPanel from "./ProjectThreadPanel";
import { deleteTask as deleteTaskAction, setTaskStatus } from "./actions";
import { STATUS_META } from "./status-meta";
import Avisos, { aviso, cerrarAviso } from "./ui/avisos";
import { moveTaskToGroup, reorderTasks, setTaskPriority } from "./board-actions";
import { setTaskParent } from "./tree-actions";

export default function BoardShell({
  projectId,
  initialTasks,
  initialGroups,
  initialAssignees,
  commentCountByTask,
  members,
  revision,
  initialView,
  orderingEnabled,
  threadEnabled,
  openTaskId,
  today
}: {
  projectId: string;
  initialTasks: BoardTask[];
  initialGroups: BoardGroup[];
  initialAssignees: Record<string, string[]>;
  commentCountByTask: Record<string, number>;
  members: string[];
  /** Huella de la estructura servida (board.ts). Ver la resincronización de abajo. */
  revision: string;
  initialView: ExecutionView;
  orderingEnabled: boolean;
  /** Solo en espacios compartidos: en el personal no hay con quién conversar. */
  threadEnabled: boolean;
  /** Tarea señalada por ?task= (campana de menciones, Home, buscador). */
  openTaskId: string | null;
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
  // Se abre YA con la tarea que venía en la URL: llegar desde una mención y
  // tener que buscarla en el tablero es exactamente el paso que el aviso
  // pretendía ahorrar. Como estado inicial y no como efecto, para que cerrar el
  // drawer no lo vuelva a abrir en el siguiente render.
  const [detailTaskId, setDetailTaskId] = useState<string | null>(openTaskId);
  const [error, setError] = useState<string | null>(null);

  // Los errores ya no ocupan una franja fija sobre el tablero: salen como
  // aviso, que es donde la persona está mirando cuando algo falla.
  useEffect(() => {
    if (!error) return;
    aviso({ id: "error-tablero", tono: "error", mensaje: error });
    setError(null);
  }, [error]);

  const estados = useCambiosConDeshacer(tasks, setTasks);

  // ADOPTAR LA ESTRUCTURA QUE TRAE EL SERVIDOR.
  //
  // page.tsx monta este componente con key={projectId}: cambiar de tablero lo
  // remonta con estado limpio. Pero aplicar una plantilla o un plan de IA NO
  // cambia el proyecto, así que la key es la misma, React no remonta nada y
  // este `useState` se quedaba con las tareas de antes — el tablero seguía
  // igual por mucho que la Server Action revalidara, y había que salir del
  // proyecto y volver a entrar para ver los grupos nuevos.
  //
  // `revision` es una huella de la FORMA del árbol (qué tareas hay, de quién
  // cuelgan, en qué grupo y en qué orden). Solo se mueve cuando el servidor
  // trae una estructura distinta, así que esto no pisa los updates optimistas
  // de estado, prioridad o título, que no la tocan. Se ajusta durante el
  // render y no en un efecto: así el primer pintado ya sale con los datos
  // nuevos, sin un fotograma con los viejos.
  const [syncedRevision, setSyncedRevision] = useState(revision);
  if (revision !== syncedRevision) {
    setSyncedRevision(revision);
    // Los cambios de estado que esperan su «Deshacer» todavía no están en la
    // base: el árbol que llega los traería con el estado viejo y el toque se
    // «perdería» a ojos de la persona.
    setTasks(estados.conPendientes(initialTasks));
    setGroups(initialGroups);
    setAssigneesByTask(initialAssignees);
    // La selección se limpia porque puede señalar filas que ya no existen; la
    // vista, los filtros y el orden NO se tocan: aplicar una plantilla no debe
    // costarle al usuario el contexto de lectura que tenía montado.
    setSelected(new Set());
  }

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
      cambiarEstado: estados.cambiar,
      avanzar: estados.avanzar,
      retenidas: estados.retenidas,
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
      tasks,
      estados
    ]
  );

  const detailTask = detailTaskId ? tasks.find((t) => t.id === detailTaskId) : null;

  return (
    <div className="xr-tablero">
      <BoardToolbar
        view={view}
        views={threadEnabled ? VIEWS_CON_HILO : VIEWS_SIN_HILO}
        onViewChange={changeView}
        filters={filters}
        onFiltersChange={setFilters}
        members={members}
      />

      {!orderingEnabled && (
        <p className="ex-hint">
          El orden manual (arrastrar tareas) está desactivado: falta aplicar la migración{" "}
          <code>0021_execution_board_order.sql</code>.
        </p>
      )}

      {filtersActive && (
        <p className="xr-nota">
          {filteredStats.total} de {stats.total} tareas
          <button type="button" className="xr-enlace" onClick={() => setFilters(EMPTY_FILTERS)}>
            Quitar filtros
          </button>
        </p>
      )}

      {view === "lista" && <LinearList api={api} tasks={filteredTasks} />}
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
      {/* El hilo no recibe `api`: no muta tareas ni comparte selección con las
          demás vistas. Solo necesita saber de qué proyecto se habla. */}
      {view === "hilo" && <ProjectThreadPanel projectId={projectId} />}

      <BulkActionBar api={api} tasks={tasks} onTasksChange={setTasks} />

      {/* Una sola hoja de detalle para TODAS las vistas. Se monta siempre y
          se abre/cierra con `task`, para que la salida se anime. */}
      <TaskSheet
        task={detailTask ?? null}
        subtareas={detailTask ? sortTasks(tasks.filter((t) => t.parentTaskId === detailTask.id), "manual") : []}
        padre={detailTask?.parentTaskId ? (tasks.find((t) => t.id === detailTask.parentTaskId) ?? null) : null}
        api={api}
        onClose={() => setDetailTaskId(null)}
        onOpenTask={setDetailTaskId}
      />

      <Avisos />
    </div>
  );
}

/**
 * Cambios de estado con «Deshacer».
 *
 * La máquina de estados no tiene vuelta atrás (lo hecho no se deshace en el
 * servidor), así que deshacer no puede ser «guardar y luego revertir». Es
 * esperar: el cambio se pinta al instante y se guarda a los 4 s. Varios
 * toques seguidos sobre la misma tarea se encadenan (Sin empezar → Trabajando
 * → Hecho) en una sola espera y un solo aviso. Al salir de la página, lo
 * pendiente se guarda de inmediato.
 */
function useCambiosConDeshacer(tasks: BoardTask[], setTasks: React.Dispatch<React.SetStateAction<BoardTask[]>>) {
  const ESPERA_MS = 4000;
  const pendientes = useRef(new Map<string, { original: TaskStatus; pasos: TaskStatus[]; timer: number }>());
  const [retenidas, setRetenidas] = useState<Map<string, TaskStatus>>(new Map());
  const tareas = useRef(tasks);
  tareas.current = tasks;

  /** Superpone a una lista del servidor los estados que aún no se guardan. */
  const conPendientes = useCallback((lista: BoardTask[]) => {
    if (!pendientes.current.size) return lista;
    return lista.map((t) => {
      const p = pendientes.current.get(t.id);
      const ultimo = p?.pasos[p.pasos.length - 1];
      return ultimo ? { ...t, status: ultimo } : t;
    });
  }, []);

  const publicar = useCallback(() => {
    setRetenidas(new Map([...pendientes.current].map(([id, p]) => [id, p.original])));
  }, []);

  const pintar = useCallback(
    (id: string, status: TaskStatus) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t))),
    [setTasks]
  );

  const guardar = useCallback(
    async (id: string) => {
      const p = pendientes.current.get(id);
      if (!p) return;
      window.clearTimeout(p.timer);
      pendientes.current.delete(id);
      publicar();
      let ultimo = p.original;
      try {
        for (const paso of p.pasos) {
          await setTaskStatus(id, paso);
          ultimo = paso;
        }
      } catch (e) {
        // Lo que sí se guardó se queda; lo demás vuelve atrás y se explica.
        pintar(id, ultimo);
        const titulo = tareas.current.find((t) => t.id === id)?.title;
        aviso({
          id: `estado-${id}`,
          tono: "error",
          mensaje: `No se pudo marcar${titulo ? ` «${titulo}»` : ""}`,
          detalle: e instanceof Error ? e.message : undefined
        });
      }
    },
    [pintar, publicar]
  );

  const cambiar = useCallback(
    (id: string, to: TaskStatus) => {
      const t = tareas.current.find((x) => x.id === id);
      if (!t || t.status === to) return;
      const p = pendientes.current.get(id) ?? { original: t.status, pasos: [], timer: 0 };
      window.clearTimeout(p.timer);
      p.pasos.push(to);
      p.timer = window.setTimeout(() => void guardar(id), ESPERA_MS);
      pendientes.current.set(id, p);
      pintar(id, to);
      publicar();
      aviso({
        id: `estado-${id}`,
        mensaje: t.title,
        detalle: to === "Completed" || to === "InProgress" || to === "Pending" ? textoDelPaso(to) : STATUS_META[to].label,
        duracion: ESPERA_MS,
        accion: {
          etiqueta: "Deshacer",
          alPulsar: () => {
            const q = pendientes.current.get(id);
            if (!q) return;
            window.clearTimeout(q.timer);
            pendientes.current.delete(id);
            pintar(id, q.original);
            publicar();
          }
        }
      });
    },
    [guardar, pintar, publicar]
  );

  const avanzar = useCallback(
    (id: string) => {
      const t = tareas.current.find((x) => x.id === id);
      const to = t ? siguientePaso(t.status) : null;
      if (to) cambiar(id, to);
    },
    [cambiar]
  );

  // Salir de la página no puede perder un toque: lo pendiente se guarda ya.
  useEffect(() => {
    const vaciar = () => {
      for (const id of [...pendientes.current.keys()]) {
        void guardar(id);
        cerrarAviso(`estado-${id}`);
      }
    };
    const alOcultar = () => document.visibilityState === "hidden" && vaciar();
    window.addEventListener("pagehide", vaciar);
    document.addEventListener("visibilitychange", alOcultar);
    return () => {
      window.removeEventListener("pagehide", vaciar);
      document.removeEventListener("visibilitychange", alOcultar);
      vaciar();
    };
  }, [guardar]);

  return useMemo(() => ({ cambiar, avanzar, retenidas, conPendientes }), [cambiar, avanzar, retenidas, conPendientes]);
}
