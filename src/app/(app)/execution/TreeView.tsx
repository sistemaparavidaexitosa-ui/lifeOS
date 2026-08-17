"use client";
// FASE 4 (Tree View). Vista tipo explorador de archivos:
//   Group
//     └── Item
//             └── Subitem (recursivo, vía TreeItemNode)
// Lee del MISMO modelo de datos que Tablero/Kanban (tasks + task_groups).
//
// Sigue el MISMO patrón arquitectónico que MondayBoard/KanbanBoard: recibe
// `initialTasks`/`initialGroups` (datos crudos) desde execution/page.tsx
// (Server Component) y es AUTOSUFICIENTE — mantiene su propio estado local
// y llama las Server Actions directamente (tree-actions.ts), con updates
// optimistas en el cliente. page.tsx NO le pasa callbacks (no es posible
// cruzar funciones arbitrarias de Server a Client Component en Next.js).
import { useMemo, useState, useTransition } from "react";
import TreeItemNode, { type TreeNodeTask } from "./TreeItemNode";
import {
  createTaskGroup,
  deleteTaskGroup,
  renameTaskGroup,
  setTaskGroup,
  setTaskParent,
  updateTaskStatusFromTree
} from "./tree-actions";
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
  initialTasks,
  initialGroups
}: {
  projectId: string;
  initialTasks: TreeNodeTask[];
  initialGroups: TreeGroup[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [groups, setGroups] = useState(initialGroups);
  const [pending, startTransition] = useTransition();
  const [newGroupName, setNewGroupName] = useState("");
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  function handleStatusChange(taskId: string, status: TaskStatus) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    startTransition(async () => {
      try {
        await updateTaskStatusFromTree(taskId, status);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar el estado");
      }
    });
  }

  function handleMove(draggedId: string, newParentId: string) {
    const newParent = tasks.find((t) => t.id === newParentId);
    setTasks((prev) =>
      prev.map((t) => (t.id === draggedId ? { ...t, parent_task_id: newParentId, group_id: newParent?.group_id ?? t.group_id } : t))
    );
    startTransition(async () => {
      try {
        await setTaskParent(draggedId, newParentId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo mover la tarea");
      }
    });
  }

  function handleDropOnGroup(e: React.DragEvent, groupId: string) {
    e.preventDefault();
    setDragOverGroup(null);
    const draggedId = e.dataTransfer.getData("text/task-id");
    if (!draggedId) return;
    setTasks((prev) => prev.map((t) => (t.id === draggedId ? { ...t, group_id: groupId } : t)));
    startTransition(async () => {
      try {
        await setTaskGroup(draggedId, groupId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo mover la tarea de grupo");
      }
    });
  }

  function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const created = await createTaskGroup({ projectId, name });
        setGroups((prev) => [...prev, created]);
        setNewGroupName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear el grupo");
      }
    });
  }

  function handleRenameGroup(groupId: string, name: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
    startTransition(async () => {
      try {
        await renameTaskGroup(groupId, name);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo renombrar el grupo");
      }
    });
  }

  function handleDeleteGroup(groupId: string) {
    const fallback = sortedGroups.find((g) => g.id !== groupId);
    if (!fallback) return; // no se permite eliminar el último grupo del Board
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setTasks((prev) => prev.map((t) => (t.group_id === groupId ? { ...t, group_id: fallback.id } : t)));
    startTransition(async () => {
      try {
        await deleteTaskGroup(groupId, fallback.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo eliminar el grupo");
      }
    });
  }

  return (
    <div className="tree-view">
      {error && (
        <div className="chip danger" style={{ marginBottom: 6 }}>
          {error}
        </div>
      )}
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
              <EditableGroupName name={group.name} onRename={(name) => handleRenameGroup(group.id, name)} />
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
              <TreeItemNode key={t.id} task={t} depth={0} childrenMap={childrenMap} onStatusChange={handleStatusChange} onMove={handleMove} />
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
