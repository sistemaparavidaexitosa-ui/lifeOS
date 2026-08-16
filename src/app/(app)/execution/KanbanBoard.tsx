"use client";

// FASE 2 — Vista Kanban (drag&drop + límite WIP). Equivalente a
// execKanban()/renderKanbanCard() en LifeOS 4.html.
//
// Reutiliza:
//   - setTaskStatus (execution/actions.ts, YA EXISTENTE) para persistir el
//     cambio de columna — la misma acción que usa TaskStatusButtons.tsx, así
//     que la validación de "no completar con dependencias abiertas"
//     (evaluateTransition / FR-EXE-005) se aplica igual aquí.
//   - TaskDetailPanel (FASE 1) dentro de cada tarjeta para abrir el detalle
//     completo (responsables, dependencias, comentarios, historial) sin
//     duplicar código.
//
// FIX (build de GitHub Actions, TS2739): TaskStatus tiene 6 miembros
// (Pending, InProgress, Blocked, Completed, Rescheduled, Cancelled), no 4.
// El objeto `map` que satisface Record<TaskStatus, KanbanTask[]> debe
// inicializar las 6 claves aunque el Kanban solo muestre 4 columnas — las
// tareas Rescheduled/Cancelled simplemente no se listan en ninguna columna
// visible (mismo criterio que progressByProject en page.tsx, que también
// excluye Cancelled de los cálculos).
//
// Patrón de optimistic update: igual que eisenhower/Board.tsx (BR-023) — se
// actualiza el estado local inmediatamente al soltar la tarjeta y, si el
// servidor rechaza la transición (por ejemplo BR-014: no completar con deps
// abiertas), se revierte y se muestra el mensaje de error.

import { useMemo, useState, useTransition } from "react";
import { setTaskStatus } from "./actions";
import TaskDetailPanel from "./TaskDetailPanel";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";

export interface KanbanTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  urgent: boolean;
  due: string | null;
}

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "Pending", label: "Pendiente" },
  { key: "InProgress", label: "En progreso" },
  { key: "Blocked", label: "Bloqueada" },
  { key: "Completed", label: "Completada" }
];

// Límite WIP por columna, igual que WIP={InProgress:4} en el HTML de
// referencia. Solo advierte (chip rojo), no bloquea el drop — mismo
// comportamiento que el original.
const WIP_LIMIT: Partial<Record<TaskStatus, number>> = { InProgress: 4 };

const PRIORITY_CHIP: Record<Priority, string> = {
  High: "chip danger",
  Medium: "chip warn",
  Low: "chip"
};

export default function KanbanBoard({
  projectId,
  initialTasks,
  assigneesByTask
}: {
  projectId: string;
  initialTasks: KanbanTask[];
  assigneesByTask: Record<string, string[]>;
}) {
  const [tasks, setTasks] = useState<KanbanTask[]>(initialTasks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const byColumn = useMemo(() => {
    const map: Record<TaskStatus, KanbanTask[]> = {
      Pending: [],
      InProgress: [],
      Blocked: [],
      Completed: [],
      Rescheduled: [],
      Cancelled: []
    };
    for (const t of tasks) map[t.status]?.push(t);
    return map;
  }, [tasks]);

  function handleDrop(newStatus: TaskStatus) {
    if (!dragId) return;
    const taskId = dragId;
    setDragId(null);
    const prev = tasks;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // Optimistic update.
    setTasks((cur) => cur.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    setError(null);

    startTransition(async () => {
      try {
        await setTaskStatus(taskId, newStatus);
      } catch (e) {
        // Revierte si el servidor rechaza la transición (p.ej. dependencias
        // abiertas al intentar mover a Completed — FR-EXE-005/BR-014).
        setTasks(prev);
        setError(e instanceof Error ? e.message : "No se pudo mover la tarea");
      }
    });
  }

  return (
    <div style={{ marginTop: 10 }}>
      {error && (
        <div className="chip danger" style={{ marginBottom: 8 }}>
          {error}
        </div>
      )}
      <div
        className="grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(220px, 1fr))", gap: 10, overflowX: "auto" }}
      >
        {COLUMNS.map((col) => {
          const list = byColumn[col.key] ?? [];
          const limit = WIP_LIMIT[col.key];
          const overLimit = limit != null && list.length > limit;
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(col.key)}
              className="card"
              style={{ background: "var(--surface)", minHeight: 160, padding: 8 }}
            >
              <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <b className="text-sm">{col.label}</b>
                <span className={overLimit ? "chip danger" : "chip"} style={{ fontSize: 11 }}>
                  {list.length}
                  {limit != null ? ` / ${limit}` : ""}
                </span>
              </div>
              {overLimit && (
                <div className="text-xs" style={{ color: "var(--danger)", marginBottom: 6 }}>
                  Límite WIP superado
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {list.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    style={{
                      background: "var(--surface2)",
                      borderRadius: 12,
                      padding: "8px 10px",
                      cursor: "grab",
                      opacity: dragId === t.id ? 0.5 : 1
                    }}
                  >
                    <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span className="text-sm" style={{ fontWeight: 700 }}>
                        {t.title}
                      </span>
                      {t.urgent && (
                        <span className="chip danger" style={{ fontSize: 10 }}>
                          Urgente
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      <span className={PRIORITY_CHIP[t.priority]} style={{ fontSize: 10 }}>
                        {t.priority}
                      </span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {t.due ? new Date(t.due).toLocaleDateString() : "sin fecha"}
                      </span>
                    </div>
                    {(assigneesByTask[t.id] ?? []).length > 0 && (
                      <div className="text-xs" style={{ color: "var(--muted)", marginTop: 4 }}>
                        👤 {(assigneesByTask[t.id] ?? []).join(", ")}
                      </div>
                    )}
                    <div style={{ marginTop: 6 }}>
                      <TaskDetailPanel taskId={t.id} taskTitle={t.title} compact />
                    </div>
                  </div>
                ))}
                {!list.length && (
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    Sin tareas
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
