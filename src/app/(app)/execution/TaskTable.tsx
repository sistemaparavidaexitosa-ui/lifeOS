// FASE 3 — Vista Tabla (Tarea, Proyecto, Responsables, Estado, Prioridad,
// Vence, Estimado). Server Component de SOLO LECTURA: no agrega ninguna
// Server Action nueva, delega toda edición al TaskDetailPanel ya existente
// (Fase 1), embebido en modo `compact` al final de cada fila.
//
// Reutiliza:
//   - task_assignees (ya consultado por page.tsx para Kanban) para mostrar
//     "Responsables" — se extendió la condición en page.tsx para traer este
//     dato también cuando view === "table".
//   - TaskDetailPanel (Fase 1) para el detalle completo por fila.

import TaskDetailPanel from "./TaskDetailPanel";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";

export interface TableTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  due: string | null;
  est: number;
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  Pending: "Pendiente",
  InProgress: "En progreso",
  Blocked: "Bloqueada",
  Rescheduled: "Reprogramada",
  Completed: "Completada",
  Cancelled: "Cancelada"
};

const STATUS_CHIP: Record<TaskStatus, string> = {
  Pending: "chip",
  InProgress: "chip accent",
  Blocked: "chip danger",
  Rescheduled: "chip warn",
  Completed: "chip ok",
  Cancelled: "chip"
};

const PRIORITY_CHIP: Record<Priority, string> = {
  High: "chip danger",
  Medium: "chip warn",
  Low: "chip"
};

export default function TaskTable({
  projectTitle,
  tasks,
  assigneesByTask
}: {
  projectTitle: string;
  tasks: TableTask[];
  assigneesByTask: Record<string, string[]>;
}) {
  return (
    <div className="card" style={{ overflowX: "auto", marginTop: 10, padding: 0 }}>
      <table className="w-full text-sm" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "var(--muted)", textAlign: "left" }}>
            <th className="pb-2" style={{ padding: "10px 12px" }}>
              Tarea
            </th>
            <th style={{ padding: "10px 12px" }}>Proyecto</th>
            <th style={{ padding: "10px 12px" }}>Responsables</th>
            <th style={{ padding: "10px 12px" }}>Estado</th>
            <th style={{ padding: "10px 12px" }}>Prioridad</th>
            <th style={{ padding: "10px 12px" }}>Vence</th>
            <th style={{ padding: "10px 12px" }}>Estimado</th>
            <th style={{ padding: "10px 12px" }} />
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const assignees = assigneesByTask[t.id] ?? [];
            return (
              <tr key={t.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ padding: "10px 12px" }}>
                  <b>{t.title}</b>
                </td>
                <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{projectTitle}</td>
                <td style={{ padding: "10px 12px", color: "var(--muted)" }}>
                  {assignees.length ? `👤 ${assignees.join(", ")}` : "—"}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <span className={STATUS_CHIP[t.status]}>{STATUS_LABEL[t.status]}</span>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <span className={PRIORITY_CHIP[t.priority]}>{t.priority}</span>
                </td>
                <td style={{ padding: "10px 12px", color: "var(--muted)" }}>
                  {t.due ? new Date(t.due).toLocaleDateString() : "—"}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{t.est} min</td>
                <td style={{ padding: "10px 12px", minWidth: 120 }}>
                  <TaskDetailPanel taskId={t.id} taskTitle={t.title} compact />
                </td>
              </tr>
            );
          })}
          {!tasks.length && (
            <tr>
              <td colSpan={8} className="text-xs" style={{ color: "var(--muted)", padding: "16px 12px" }}>
                Sin tareas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
