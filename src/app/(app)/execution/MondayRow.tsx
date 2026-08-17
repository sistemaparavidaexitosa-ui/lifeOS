"use client";
// Fila recursiva del tablero Monday-style (equivalente a "renderTaskRow()" +
// "renderSubitem()" en la referencia de monday.com). Cada tarea puede tener
// N subtareas (parent_task_id, migración 0018), renderizadas indentadas de
// forma recursiva — igual que "Subitem Level 1 / Subitem Level 2" en la
// imagen de referencia. Reutiliza TaskDetailPanel (ya existente) para el
// detalle completo (comentarios, dependencias, historial) sin duplicar
// código: el ícono de comentario simplemente lo abre/cierra.
//
// FASE 3 — FIX: antes, el ícono de comentario montaba/desmontaba
// TaskDetailPanel por completo ({detailOpen && <TaskDetailPanel .../>}),
// lo que obligaba a un SEGUNDO clic para ver el contenido (el componente
// recién montado siempre arrancaba con su propio estado interno `open` en
// false). Ahora TaskDetailPanel se mantiene SIEMPRE montado y se controla
// en modo controlado (open/onOpenChange) — un solo clic abre el Drawer
// lateral real (ver TaskDetailPanel.tsx).
//
// FIX (retrofit de Groups): la fila raíz ahora es draggable (HTML5 nativo,
// sin librerías) — permite arrastrarla hacia el encabezado de otra sección
// .mb-group en MondayBoard.tsx para moverla de grupo (setTaskGroup, ya
// construido en tree-actions.ts desde Fase 4). Las subtareas NO son
// draggable entre grupos (siempre viven dentro del grupo de su padre).
import { useState } from "react";
import { IconChevronRight, IconChevronDown, IconComment, IconPlus } from "@/components/icons";
import StatusMenu from "./StatusMenu";
import TimelineEditor from "./TimelineEditor";
import AssigneePopover from "./AssigneePopover";
import QuickAddRow from "./QuickAddRow";
import TaskDetailPanel from "./TaskDetailPanel";
import { renameTask, type CreatedTaskRow } from "./actions";
import type { TaskStatus } from "@/lib/domain/types.ts";
import type { MondayTask } from "./MondayBoard";

export default function MondayRow({
  task,
  depth,
  childrenMap,
  assigneesByTask,
  commentCountByTask,
  members,
  projectId,
  onStatusChange,
  onDatesChange,
  onAssigneesChange,
  onSubtaskCreated
}: {
  task: MondayTask;
  depth: number;
  childrenMap: Record<string, MondayTask[]>;
  assigneesByTask: Record<string, string[]>;
  commentCountByTask: Record<string, number>;
  members: string[];
  projectId: string;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDatesChange: (id: string, start: string | null, due: string | null) => void;
  onAssigneesChange: (id: string, names: string[]) => void;
  onSubtaskCreated: (task: CreatedTaskRow) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [title, setTitle] = useState(task.title);
  const children = childrenMap[task.id] ?? [];
  const commentCount = commentCountByTask[task.id] ?? 0;
  const assignees = assigneesByTask[task.id] ?? [];
  const indentClass = depth ? ` mb-indent-${Math.min(depth, 2)}` : "";

  function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(task.title);
      return;
    }
    if (trimmed === task.title) return;
    renameTask(task.id, trimmed).catch(() => setTitle(task.title));
  }

  return (
    <>
      <div
        className={`mb-row${indentClass}`}
        draggable={depth === 0}
        onDragStart={depth === 0 ? (e) => e.dataTransfer.setData("text/task-id", task.id) : undefined}
        style={depth === 0 ? { cursor: "grab" } : undefined}
      >
        <div className="mb-row-item">
          {children.length > 0 ? (
            <button className="mb-expand" onClick={() => setExpanded((v) => !v)} aria-label="Subtareas">
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
          />
          {children.length > 0 && <span className="mb-badge-count">{children.length}</span>}
          <button className="mb-comment-btn" onClick={() => setDetailOpen((v) => !v)} title="Comentarios y detalle">
            <IconComment />
            {commentCount > 0 && <span className="mb-badge-count">{commentCount}</span>}
          </button>
          <button className="mb-comment-btn" onClick={() => setAddingSub((v) => !v)} title="Agregar subtarea">
            <IconPlus />
          </button>
        </div>
        <div className="mb-row-meta">
          <AssigneePopover
            taskId={task.id}
            members={members}
            selected={assignees}
            onChange={(names) => onAssigneesChange(task.id, names)}
          />
          <StatusMenu taskId={task.id} status={task.status} onChange={(s) => onStatusChange(task.id, s)} />
        </div>
        <TimelineEditor
          taskId={task.id}
          start={task.startDate}
          due={task.due}
          onChange={(s, d) => onDatesChange(task.id, s, d)}
        />
        <span />
      </div>
      {addingSub && (
        <QuickAddRow
          projectId={projectId}
          parentTaskId={task.id}
          placeholder="+ Agregar subtarea"
          indent={depth + 1}
          onCreated={(t) => {
            onSubtaskCreated(t);
            setAddingSub(false);
            setExpanded(true);
          }}
        />
      )}
      {/* FASE 3: siempre montado, controlado por detailOpen — un solo clic
          en el ícono de comentario abre el Drawer lateral (ver arriba). */}
      <TaskDetailPanel taskId={task.id} taskTitle={task.title} compact open={detailOpen} onOpenChange={setDetailOpen} />
      {expanded &&
        children.map((child) => (
          <MondayRow
            key={child.id}
            task={child}
            depth={depth + 1}
            childrenMap={childrenMap}
            assigneesByTask={assigneesByTask}
            commentCountByTask={commentCountByTask}
            members={members}
            projectId={projectId}
            onStatusChange={onStatusChange}
            onDatesChange={onDatesChange}
            onAssigneesChange={onAssigneesChange}
            onSubtaskCreated={onSubtaskCreated}
          />
        ))}
    </>
  );
}
