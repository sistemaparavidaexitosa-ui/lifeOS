"use client";
// Fila recursiva del tablero (Tarea → Subtarea → …).
//
// Novedades del rediseño:
//   - Casilla de selección (acciones masivas) y asa de arrastre visible.
//   - Zonas de soltado de 3 modos: mitad superior = insertar antes, mitad
//     inferior = insertar después, centro = anidar como subtarea. La línea
//     azul / el resaltado indican en todo momento qué va a pasar.
//   - Columna de Prioridad inline y chip de fecha que se pinta en rojo
//     cuando la tarea está vencida (antes había que abrir el detalle para
//     enterarse).
//   - Barra de avance de subtareas en la fila padre.
//   - El detalle ya no monta un Drawer por fila: llama a api.openDetail y
//     BoardShell monta UNO solo.
import { useState } from "react";
import { computeStats, isOverdue } from "@/lib/domain/board.ts";
import { IconChevronRight, IconChevronDown, IconComment, IconPlus, IconTrash } from "@/components/icons";
import StatusMenu from "./StatusMenu";
import PriorityMenu from "./PriorityMenu";
import TimelineEditor from "./TimelineEditor";
import AssigneePopover from "./AssigneePopover";
import QuickAddRow from "./QuickAddRow";
import { renameTask } from "./actions";
import type { BoardApi, BoardTask } from "./board-types";
import type { DropHint, DropMode } from "./MondayBoard";

export default function MondayRow({
  api,
  task,
  depth,
  childrenMap,
  dragTaskId,
  dropHint,
  onDragStart,
  onDragHint,
  onDropOnRow
}: {
  api: BoardApi;
  task: BoardTask;
  depth: number;
  childrenMap: Record<string, BoardTask[]>;
  dragTaskId: string | null;
  dropHint: DropHint | null;
  onDragStart: (id: string | null) => void;
  onDragHint: (hint: DropHint | null) => void;
  onDropOnRow: (task: BoardTask, mode: DropMode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addingSub, setAddingSub] = useState(false);
  const [title, setTitle] = useState(task.title);

  const children = childrenMap[task.id] ?? [];
  const commentCount = api.commentCountByTask[task.id] ?? 0;
  const assignees = api.assigneesByTask[task.id] ?? [];
  const isSelected = api.selected.has(task.id);
  const overdue = isOverdue(task, api.today);
  const subStats = children.length ? computeStats(children, api.today) : null;
  const hint = dropHint?.taskId === task.id ? dropHint.mode : null;
  const dragging = dragTaskId === task.id;

  function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(task.title);
      return;
    }
    if (trimmed === task.title) return;
    api.patchTask(task.id, { title: trimmed });
    renameTask(task.id, trimmed).catch((e) => {
      setTitle(task.title);
      api.patchTask(task.id, { title: task.title });
      api.reportError(e instanceof Error ? e.message : "No se pudo renombrar la tarea");
    });
  }

  function confirmDelete() {
    const suffix = children.length ? ` y sus ${children.length} subtarea(s)` : "";
    if (window.confirm(`¿Eliminar "${task.title}"${suffix}? Esta acción no se puede deshacer.`)) {
      api.deleteTask(task.id);
    }
  }

  /** Zona vertical bajo el cursor → modo de soltado (ClickUp-style). */
  function hintFromPointer(e: React.DragEvent<HTMLDivElement>): DropMode {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    if (ratio < 0.3) return "before";
    if (ratio > 0.7) return "after";
    return "child";
  }

  return (
    <>
      <div
        className={[
          "mb-row",
          depth ? `mb-indent-${Math.min(depth, 3)}` : "",
          isSelected ? "selected" : "",
          dragging ? "dragging" : "",
          hint ? `drop-${hint}` : ""
        ]
          .filter(Boolean)
          .join(" ")}
        draggable={api.orderingEnabled}
        onDragStart={(e) => {
          if (!api.orderingEnabled) return;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/task-id", task.id);
          onDragStart(task.id);
        }}
        onDragEnd={() => onDragStart(null)}
        onDragOver={(e) => {
          if (!dragTaskId || dragTaskId === task.id) return;
          e.preventDefault();
          e.stopPropagation();
          onDragHint({ taskId: task.id, mode: hintFromPointer(e) });
        }}
        onDragLeave={() => onDragHint(null)}
        onDrop={(e) => {
          if (!dragTaskId || dragTaskId === task.id) return;
          e.preventDefault();
          e.stopPropagation();
          onDropOnRow(task, hintFromPointer(e));
        }}
      >
        <div className="mb-row-item">
          <input
            type="checkbox"
            className="mb-check"
            checked={isSelected}
            onChange={(e) => api.toggleSelected(task.id, e.target.checked)}
            aria-label={`Seleccionar ${task.title}`}
          />
          {api.orderingEnabled && (
            <span className="mb-drag" aria-hidden title="Arrastrar para reordenar o anidar">
              ⠿
            </span>
          )}
          {children.length > 0 ? (
            <button
              type="button"
              className="mb-expand"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? "Ocultar subtareas" : "Ver subtareas"}
            >
              {expanded ? <IconChevronDown /> : <IconChevronRight />}
            </button>
          ) : (
            <span className="mb-expand" />
          )}

          <input
            className="mb-row-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            aria-label="Título de la tarea"
          />

          {subStats && (
            <span className="mb-substats" title={`${subStats.done} de ${subStats.total} subtareas completadas`}>
              <i style={{ width: `${subStats.pct}%` }} />
              <b>
                {subStats.done}/{subStats.total}
              </b>
            </span>
          )}
          {task.urgent && <span className="chip bad mb-urgent">Urgente</span>}

          <span className="mb-row-tools">
            <button
              type="button"
              className="mb-icon-btn"
              onClick={() => api.openDetail(task.id)}
              title="Abrir detalle (descripción, dependencias, archivos, comentarios)"
              aria-label="Abrir detalle"
            >
              <IconComment />
              {commentCount > 0 && <span className="mb-badge-count">{commentCount}</span>}
            </button>
            <button
              type="button"
              className="mb-icon-btn"
              onClick={() => setAddingSub((v) => !v)}
              title="Agregar subtarea"
              aria-label="Agregar subtarea"
            >
              <IconPlus />
            </button>
            <button
              type="button"
              className="mb-icon-btn danger"
              onClick={confirmDelete}
              title={depth > 0 ? "Eliminar subtarea" : "Eliminar tarea"}
              aria-label={depth > 0 ? "Eliminar subtarea" : "Eliminar tarea"}
            >
              <IconTrash />
            </button>
          </span>
        </div>

        <div className="mb-cell mb-cell-people">
          <AssigneePopover
            taskId={task.id}
            members={api.members}
            selected={assignees}
            onChange={(names) => api.setAssignees(task.id, names)}
          />
        </div>
        <div className="mb-cell">
          <StatusMenu taskId={task.id} status={task.status} onChange={(s) => api.setStatus(task.id, s)} />
        </div>
        <div className="mb-cell">
          <PriorityMenu
            priority={task.priority}
            urgent={task.urgent}
            onChange={(priority, urgent) => api.setPriority(task.id, priority, urgent)}
          />
        </div>
        <div className="mb-cell">
          <TimelineEditor
            taskId={task.id}
            start={task.startDate}
            due={task.due}
            overdue={overdue}
            today={api.today}
            onChange={(startDate, due) => api.patchTask(task.id, { startDate, due })}
          />
        </div>
      </div>

      {addingSub && (
        <QuickAddRow
          projectId={api.projectId}
          parentTaskId={task.id}
          placeholder="+ Agregar subtarea"
          indent={depth + 1}
          onCreated={(t) => {
            api.taskCreated(t);
            setAddingSub(false);
            setExpanded(true);
          }}
        />
      )}

      {expanded &&
        children.map((child) => (
          <MondayRow
            key={child.id}
            api={api}
            task={child}
            depth={depth + 1}
            childrenMap={childrenMap}
            dragTaskId={dragTaskId}
            dropHint={dropHint}
            onDragStart={onDragStart}
            onDragHint={onDragHint}
            onDropOnRow={onDropOnRow}
          />
        ))}
    </>
  );
}
