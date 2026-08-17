"use client";
// FASE 4 (Tree View). Nodo recursivo: Item -> Subitem -> Subitem...
// Reutiliza StatusMenu (chip de estado ya existente) y TaskDetailPanel en
// modo controlado (mismo fix de doble-clic aplicado en MondayRow.tsx,
// Fase 3) para abrir el Drawer lateral al hacer clic en el título. El
// drag&drop usa la API HTML5 nativa (draggable + onDragOver/onDrop), sin
// agregar ninguna librería nueva al proyecto.
//
// Recibe onStatusChange/onMoved como callbacks de su padre DIRECTO
// (TreeView.tsx, un Client Component) — esto es válido en Next.js (solo
// está restringido pasar callbacks desde un Server Component). TreeView es
// quien realmente llama a las Server Actions (updateTaskStatusFromTree,
// setTaskParent) y mantiene el estado local, igual que MondayBoard.tsx.
import { useState } from "react";
import { IconChevronRight, IconChevronDown } from "@/components/icons";
import StatusMenu from "./StatusMenu";
import TaskDetailPanel from "./TaskDetailPanel";
import { isDescendant, countDescendantProgress, type TreeTaskLike } from "@/lib/domain/task-tree";
import type { TaskStatus } from "@/lib/domain/types.ts";

export interface TreeNodeTask extends TreeTaskLike {
  title: string;
  status: TaskStatus;
}

export default function TreeItemNode({
  task,
  depth,
  childrenMap,
  onStatusChange,
  onMove
}: {
  task: TreeNodeTask;
  depth: number;
  childrenMap: Record<string, TreeNodeTask[]>;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onMove: (draggedId: string, newParentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const children = childrenMap[task.id] ?? [];
  const { total, done } = countDescendantProgress(childrenMap, task.id);
  const pct = total > 0 ? Math.round((done / total) * 100) : null;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const draggedId = e.dataTransfer.getData("text/task-id");
    if (!draggedId || draggedId === task.id) return;
    // Guarda de ciclos: no permitir soltar un ancestro dentro de su propio
    // descendiente (ver task-tree.ts).
    if (isDescendant(childrenMap, draggedId, task.id)) return;
    onMove(draggedId, task.id);
  }

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        className={`tree-node${dragOver ? " tree-node-dragover" : ""}`}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/task-id", task.id)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {children.length > 0 ? (
          <button className="mb-expand" onClick={() => setExpanded((v) => !v)} aria-label="Subtareas">
            {expanded ? <IconChevronDown /> : <IconChevronRight />}
          </button>
        ) : (
          <span className="mb-expand" />
        )}
        <button type="button" className="tree-node-title" onClick={() => setDetailOpen(true)}>
          {task.title}
        </button>
        {pct !== null && (
          <span className="tree-progress" title={`${done}/${total} subtareas completadas`}>
            <span className="tree-progress-bar" style={{ width: `${pct}%` }} />
            <span className="tree-progress-label">{pct}%</span>
          </span>
        )}
        {children.length > 0 && <span className="mb-badge-count">{children.length}</span>}
        <StatusMenu taskId={task.id} status={task.status} onChange={(s) => onStatusChange(task.id, s)} />
      </div>
      <TaskDetailPanel taskId={task.id} taskTitle={task.title} compact open={detailOpen} onOpenChange={setDetailOpen} />
      {expanded &&
        children.map((child) => (
          <TreeItemNode
            key={child.id}
            task={child}
            depth={depth + 1}
            childrenMap={childrenMap}
            onStatusChange={onStatusChange}
            onMove={onMove}
          />
        ))}
    </div>
  );
}
