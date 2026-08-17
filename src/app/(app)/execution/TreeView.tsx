"use client";
// FASE 4 (Tree View). Vista tipo explorador de archivos:
//   Group
//     └── Item
//             └── Subitem (recursivo, vía TreeItemNode)
// Lee del MISMO modelo de datos que Tablero/Kanban (tasks + task_groups),
// sin duplicar ninguna query: recibe `tasks` y `groups` ya cargados por el
// padre (execution/page.tsx), igual que MondayBoard/KanbanBoard.
import { useMemo, useState, useTransition } from "react";
import TreeItemNode, { type TreeNodeTask } from "./TreeItemNode";
import { createTaskGroup, deleteTaskGroup, renameTaskGroup, setTaskGroup } from "./tree-actions";
import { buildChildrenMap, countGroupProgress } from "@/lib/domain/task-tree";
import { IconPlus, IconTrash } from "@/components/icons";
import type { TaskStatus } from "@/lib/domain/types.ts";

export interface TreeGroup {
  id: string;
  name: string;
  color: string;
  position: number;
}

export default function TreeView({
  projectId,
  tasks,
  groups,
  onStatusChange,
  onReload
}: {
  projectId: string;
  tasks: TreeNodeTask[];
  groups: TreeGroup[];
  onStatusChange: (id: string, status: TaskStatus) => void;
  onReload: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [newGroupName, setNewGroupName] = useState("");
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  // childrenMap se construye SOLO con tareas de nivel raíz por grupo (los
  // Subitems anidados se resuelven dentro de TreeItemNode recursivamente vía
  // el mismo childrenMap completo — no se recalcula por nodo).
  const childrenMap = useMemo(() => buildChildrenMap(tasks), [tasks]);
  const rootTasksByGroup = useMemo(() => {
    const map: Record<string, TreeNodeTask[]> = {};
    for (const t of tasks) {
      if (t.parent_task_id) continue; // los Subitems se resuelven vía childrenMap
      const key = t.group_id ?? "__ungrouped__";
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [tasks]);

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.position - b.position), [groups]);

  function handleDropOnGroup(e: React.DragEvent, groupId: string) {
    e.preventDefault();
    setDragOverGroup(null);
    const draggedId = e.dataTransfer.getData("text/task-id");
    if (!draggedId) return;
    startTransition(async () => {
      await setTaskGroup(draggedId, groupId);
      onReload();
    });
  }

  function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    startTransition(async () => {
      await createTaskGroup({ projectId, name });
      setNewGroupName("");
      onReload();
    });
  }

  function handleDeleteGroup(groupId: string) {
    const fallback = sortedGroups.find((g) => g.id !== groupId);
    if (!fallback) return; // no se permite eliminar el último grupo del Board
    startTransition(async () => {
      await deleteTaskGroup(groupId, fallback.id);
      onReload();
    });
  }

  return (
    <div className="tree-view">
      {sortedGroups.map((group) => {
        const groupTasks = rootTasksByGroup[group.id] ?? [];
        const { total, done } = countGroupProgress(tasks, group.id);
        const pct = total > 0 ? Math.round((done / total) * 100) : null;
        return (
          <div
            key={group.id}
            className={`tree-group${dragOverGroup === group.id ? " tree-group-dragover" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverGroup(group.id);
            }}
            onDragLeave={() => setDragOverGroup(null)}
            onDrop={(e) => handleDropOnGroup(e, group.id)}
          >
            <div className="tree-group-head" style={{ borderLeftColor: group.color }}>
              <EditableGroupName
                name={group.name}
                onRename={(name) =>
                  startTransition(async () => {
                    await renameTaskGroup(group.id, name);
                    onReload();
                  })
                }
              />
              <span className="mb-badge-count">{groupTasks.length}</span>
              {pct !== null && (
                <span className="tree-progress" title={`${done}/${total} tareas completadas en este grupo`}>
                  <span className="tree-progress-bar" style={{ width: `${pct}%` }} />
                  <span className="tree-progress-label">{pct}%</span>
                </span>
              )}
              {sortedGroups.length > 1 && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  style={{ color: "var(--danger)", marginLeft: "auto" }}
                  onClick={() => handleDeleteGroup(group.id)}
                  disabled={pending}
                  aria-label={`Eliminar grupo ${group.name}`}
                >
                  <IconTrash />
                </button>
              )}
            </div>
            {groupTasks.length === 0 && (
              <p className="text-xs" style={{ color: "var(--muted)", padding: "8px 0 8px 20px" }}>
                Sin tareas — arrastra un Item aquí.
              </p>
            )}
            {groupTasks.map((t) => (
              <TreeItemNode
                key={t.id}
                task={t}
                depth={0}
                childrenMap={childrenMap}
                onStatusChange={onStatusChange}
                onMoved={onReload}
              />
            ))}
          </div>
        );
      })}
      <div className="tree-add-group">
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
          placeholder="+ Nuevo grupo"
        />
        <button type="button" className="btn-ghost btn-sm" onClick={handleCreateGroup} disabled={pending}>
          <IconPlus />
        </button>
      </div>
    </div>
  );
}

function EditableGroupName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name);

  function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setValue(name);
      return;
    }
    onRename(trimmed);
  }

  return (
    <input
      className="tree-group-name"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
