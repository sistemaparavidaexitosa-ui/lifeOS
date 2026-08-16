"use client";

// Tablero principal "Proyectos y Tareas", rediseñado estilo monday.com:
// grupo con barra de color, encabezados de columna (Tarea/Personas/Estado/
// Fechas), filas con subtareas anidadas ilimitadas (parent_task_id,
// migración 0018), pills de estado coloreadas, avatares de responsables,
// chip de rango de fechas (Timeline) y alta rápida de tareas/subtareas.
//
// En móvil (ver .mb-row en globals.css) las filas se convierten en tarjetas
// apiladas en vez de una tabla con scroll horizontal — resuelve el problema
// reportado de que el diseño "no reacciona bien" en celular.
import { useMemo, useState } from "react";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";
import MondayRow from "./MondayRow";
import QuickAddRow from "./QuickAddRow";
import type { CreatedTaskRow } from "./actions";

export interface MondayTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  urgent: boolean;
  due: string | null;
  startDate: string | null;
  parentTaskId: string | null;
}

export default function MondayBoard({
  projectId,
  groupColor = "var(--accent)",
  initialTasks,
  assigneesByTask: initialAssignees,
  commentCountByTask,
  members
}: {
  projectId: string;
  groupColor?: string;
  initialTasks: MondayTask[];
  assigneesByTask: Record<string, string[]>;
  commentCountByTask: Record<string, number>;
  members: string[];
}) {
  const [tasks, setTasks] = useState<MondayTask[]>(initialTasks);
  const [assigneesByTask, setAssigneesByTask] = useState<Record<string, string[]>>(initialAssignees);

  const childrenMap = useMemo(() => {
    const map: Record<string, MondayTask[]> = {};
    for (const t of tasks) {
      if (t.parentTaskId) (map[t.parentTaskId] ??= []).push(t);
    }
    return map;
  }, [tasks]);

  const roots = tasks.filter((t) => !t.parentTaskId);

  function handleStatusChange(id: string, status: TaskStatus) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }
  function handleDatesChange(id: string, startDate: string | null, due: string | null) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, startDate, due } : t)));
  }
  function handleAssigneesChange(id: string, names: string[]) {
    setAssigneesByTask((prev) => ({ ...prev, [id]: names }));
  }
  function handleTaskCreated(created: CreatedTaskRow) {
    setTasks((prev) => [
      ...prev,
      {
        id: created.id,
        title: created.title,
        status: created.status,
        priority: created.priority,
        urgent: created.urgent,
        due: created.due,
        startDate: created.startDate,
        parentTaskId: created.parentTaskId
      }
    ]);
  }

  return (
    <div className="mb-group" style={{ "--group-color": groupColor } as React.CSSProperties}>
      <div className="mb-cols">
        <span>Tarea</span>
        <span style={{ textAlign: "center" }}>Personas</span>
        <span style={{ textAlign: "center" }}>Estado</span>
        <span style={{ textAlign: "center" }}>Fechas</span>
        <span />
      </div>

      {roots.map((t) => (
        <MondayRow
          key={t.id}
          task={t}
          depth={0}
          childrenMap={childrenMap}
          assigneesByTask={assigneesByTask}
          commentCountByTask={commentCountByTask}
          members={members}
          projectId={projectId}
          onStatusChange={handleStatusChange}
          onDatesChange={handleDatesChange}
          onAssigneesChange={handleAssigneesChange}
          onSubtaskCreated={handleTaskCreated}
        />
      ))}

      {!roots.length && (
        <div className="text-sm" style={{ padding: "16px 12px", color: "var(--muted)" }}>
          Sin tareas todavía. Agrega la primera abajo. ✨
        </div>
      )}

      <QuickAddRow projectId={projectId} placeholder="+ Agregar tarea" onCreated={handleTaskCreated} />
    </div>
  );
}
