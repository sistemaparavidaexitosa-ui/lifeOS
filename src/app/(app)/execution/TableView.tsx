"use client";
// Vista "Tabla": todas las tareas del proyecto en una rejilla plana y
// ordenable, con edición inline.
//
// Reemplaza la antigua vista "Lista", que apilaba un TaskDetailPanel por
// tarea (N drawers montados, sin columnas, sin orden, sin edición directa) y
// a la vieja TaskTable de solo lectura. Aquí sí se puede escanear el
// proyecto completo — subtareas incluidas, con su ruta padre — y editar
// estado, prioridad, personas y fechas sin abrir nada.
import { useMemo } from "react";
import { isOverdue, sortTasks, type SortKey } from "@/lib/domain/board.ts";
import StatusMenu from "./StatusMenu";
import PriorityMenu from "./PriorityMenu";
import TimelineEditor from "./TimelineEditor";
import AssigneePopover from "./AssigneePopover";
import { IconComment, IconTrash } from "@/components/icons";
import type { BoardApi, BoardTask } from "./board-types";

const COLUMNS: { key: SortKey; label: string; sortable: boolean }[] = [
  { key: "title", label: "Tarea", sortable: true },
  { key: "manual", label: "Grupo", sortable: false },
  { key: "manual", label: "Personas", sortable: false },
  { key: "status", label: "Estado", sortable: true },
  { key: "priority", label: "Prioridad", sortable: true },
  { key: "due", label: "Fechas", sortable: true },
  { key: "manual", label: "Est.", sortable: false }
];

export default function TableView({
  api,
  tasks,
  sort,
  onSortChange,
  today
}: {
  api: BoardApi;
  tasks: BoardTask[];
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  today: string;
}) {
  const groupById = useMemo(() => new Map(api.groups.map((g) => [g.id, g])), [api.groups]);
  const titleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  const rows = useMemo(() => sortTasks(tasks, sort), [tasks, sort]);
  const allSelected = rows.length > 0 && rows.every((t) => api.selected.has(t.id));

  return (
    <div className="tv-wrap card">
      <table className="tv-table">
        <thead>
          <tr>
            <th className="tv-check">
              <input
                type="checkbox"
                className="mb-check"
                checked={allSelected}
                onChange={(e) => api.selectMany(rows.map((t) => t.id), e.target.checked)}
                aria-label="Seleccionar todas"
              />
            </th>
            {COLUMNS.map((col) => (
              <th key={col.label}>
                {col.sortable ? (
                  <button
                    type="button"
                    className={`tv-sort${sort === col.key ? " active" : ""}`}
                    onClick={() => onSortChange(sort === col.key ? "manual" : col.key)}
                    title={sort === col.key ? "Quitar orden" : `Ordenar por ${col.label.toLowerCase()}`}
                  >
                    {col.label}
                    {sort === col.key ? " ▾" : ""}
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const group = t.groupId ? groupById.get(t.groupId) : undefined;
            const parentTitle = t.parentTaskId ? titleById.get(t.parentTaskId) : undefined;
            return (
              <tr key={t.id} className={api.selected.has(t.id) ? "selected" : undefined}>
                <td className="tv-check">
                  <input
                    type="checkbox"
                    className="mb-check"
                    checked={api.selected.has(t.id)}
                    onChange={(e) => api.toggleSelected(t.id, e.target.checked)}
                    aria-label={`Seleccionar ${t.title}`}
                  />
                </td>
                <td>
                  <button type="button" className="tv-title" onClick={() => api.openDetail(t.id)}>
                    {parentTitle && <span className="tv-parent">↳ {parentTitle} /</span>} {t.title}
                  </button>
                </td>
                <td>
                  {group ? (
                    <span className="tv-group" style={{ color: group.color }}>
                      ● {group.name}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <AssigneePopover
                    taskId={t.id}
                    members={api.members}
                    selected={api.assigneesByTask[t.id] ?? []}
                    onChange={(names) => api.setAssignees(t.id, names)}
                  />
                </td>
                <td>
                  <StatusMenu taskId={t.id} status={t.status} onChange={(s) => api.setStatus(t.id, s)} onError={api.reportError} />
                </td>
                <td>
                  <PriorityMenu
                    priority={t.priority}
                    urgent={t.urgent}
                    onChange={(priority, urgent) => api.setPriority(t.id, priority, urgent)}
                  />
                </td>
                <td>
                  <TimelineEditor
                    taskId={t.id}
                    start={t.startDate}
                    due={t.due}
                    overdue={isOverdue(t, today)}
                    onChange={(startDate, due) => api.patchTask(t.id, { startDate, due })}
                  />
                </td>
                <td className="tv-est">{t.est} min</td>
                <td className="tv-actions">
                  <button type="button" className="mb-icon-btn" onClick={() => api.openDetail(t.id)} aria-label="Abrir detalle">
                    <IconComment />
                  </button>
                  <button
                    type="button"
                    className="mb-icon-btn danger"
                    onClick={() => window.confirm(`¿Eliminar "${t.title}"?`) && api.deleteTask(t.id)}
                    aria-label="Eliminar"
                  >
                    <IconTrash />
                  </button>
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={9} className="tv-empty text-xs">
                Sin tareas que coincidan con los filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
