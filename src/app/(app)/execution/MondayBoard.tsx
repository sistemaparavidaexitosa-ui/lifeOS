"use client";
// Tablero principal "Proyectos y Tareas", rediseñado estilo monday.com.
//
// FIX (retrofit de Groups, post-Fase-2/Fase-4): ANTES este componente
// renderizaba UN SOLO bloque .mb-group con TODAS las tareas del proyecto,
// coloreado con un único color derivado del índice del proyecto — nunca
// llegó a consumir task_groups (agregado en la migración 0019, Fase 2).
// Solo TreeView.tsx (Fase 4) usaba Groups, dejando al Tablero (la vista
// POR DEFECTO) sin el rasgo visual más distintivo de Monday: múltiples
// secciones de color, cada una con su propio grupo, nombre editable y
// contador.
//
// Ahora MondayBoard renderiza UNA sección .mb-group POR CADA task_group
// del proyecto (reutilizando 100% las Server Actions de tree-actions.ts ya
// construidas en Fase 4: createTaskGroup/renameTaskGroup/deleteTaskGroup/
// setTaskGroup — cero funciones nuevas, cero tablas nuevas), con:
//   - Barra de color propia por grupo (group.color).
//   - Nombre de grupo editable inline (blur-to-save, mismo patrón que el
//     título de una tarea).
//   - Contador de tareas del grupo.
//   - Botón eliminar grupo (si hay más de uno).
//   - "+ Agregar tarea" dentro de cada grupo (crea la tarea YA asignada a
//     ese grupo).
//   - "+ Nuevo grupo" al final del tablero.
//   - Drag & drop nativo (HTML5) de una fila hacia el encabezado de otro
//     grupo, para mover la tarea de grupo (igual que arrastrar una fila
//     entre secciones de color en monday.com real).
import { useMemo, useState } from "react";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";
import MondayRow from "./MondayRow";
import QuickAddRow from "./QuickAddRow";
import { createTaskGroup, deleteTaskGroup, renameTaskGroup, setTaskGroup } from "./tree-actions";
import { IconPlus, IconTrash } from "@/components/icons";
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
  groupId: string | null;
}

export interface MondayGroup {
  id: string;
  name: string;
  color: string;
  position: number;
}

export default function MondayBoard({
  projectId,
  initialTasks,
  initialGroups,
  assigneesByTask: initialAssignees,
  commentCountByTask,
  members
}: {
  projectId: string;
  initialTasks: MondayTask[];
  initialGroups: MondayGroup[];
  assigneesByTask: Record<string, string[]>;
  commentCountByTask: Record<string, number>;
  members: string[];
}) {
  const [tasks, setTasks] = useState<MondayTask[]>(initialTasks);
  const [groups, setGroups] = useState<MondayGroup[]>(initialGroups);
  const [assigneesByTask, setAssigneesByTask] = useState<Record<string, string[]>>(initialAssignees);
  const [newGroupName, setNewGroupName] = useState("");
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const childrenMap = useMemo(() => {
    const map: Record<string, MondayTask[]> = {};
    for (const t of tasks) {
      if (t.parentTaskId) (map[t.parentTaskId] ??= []).push(t);
    }
    return map;
  }, [tasks]);

  const rootsByGroup = useMemo(() => {
    const map: Record<string, MondayTask[]> = {};
    for (const t of tasks) {
      if (t.parentTaskId) continue;
      const key = t.groupId ?? "__ungrouped__";
      (map[key] ??= []).push(t);
    }
    return map;
  }, [tasks]);

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.position - b.position), [groups]);

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
        parentTaskId: created.parentTaskId,
        groupId: created.groupId
      }
    ]);
  }

  function handleDropOnGroup(e: React.DragEvent, groupId: string) {
    e.preventDefault();
    setDragOverGroup(null);
    const draggedId = e.dataTransfer.getData("text/task-id");
    if (!draggedId) return;
    setTasks((prev) => prev.map((t) => (t.id === draggedId ? { ...t, groupId } : t)));
    setTaskGroup(draggedId, groupId).catch((err) => {
      setError(err instanceof Error ? err.message : "No se pudo mover la tarea de grupo");
    });
  }

  function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    createTaskGroup({ projectId, name })
      .then((created) => {
        setGroups((prev) => [...prev, created]);
        setNewGroupName("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo crear el grupo"));
  }

  function handleRenameGroup(groupId: string, name: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
    renameTaskGroup(groupId, name).catch((err) => setError(err instanceof Error ? err.message : "No se pudo renombrar el grupo"));
  }

  function handleDeleteGroup(groupId: string) {
    const fallback = sortedGroups.find((g) => g.id !== groupId);
    if (!fallback) return; // no se permite eliminar el último grupo del Board
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setTasks((prev) => prev.map((t) => (t.groupId === groupId ? { ...t, groupId: fallback.id } : t)));
    deleteTaskGroup(groupId, fallback.id).catch((err) => setError(err instanceof Error ? err.message : "No se pudo eliminar el grupo"));
  }

  return (
    <div>
      {error && (
        <div className="chip danger" style={{ marginBottom: 8 }}>
          {error}
        </div>
      )}
      {sortedGroups.map((group) => {
        const rootTasks = rootsByGroup[group.id] ?? [];
        return (
          <div
            key={group.id}
            className="mb-group"
            style={{ "--group-color": group.color } as React.CSSProperties}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverGroup(group.id);
            }}
            onDragLeave={() => setDragOverGroup((cur) => (cur === group.id ? null : cur))}
            onDrop={(e) => handleDropOnGroup(e, group.id)}
          >
            <div
              className="mb-group-head"
              style={dragOverGroup === group.id ? { outline: "2px dashed var(--group-color, var(--accent))", outlineOffset: -2 } : undefined}
            >
              <EditableGroupName name={group.name} onRename={(name) => handleRenameGroup(group.id, name)} />
              <span className="mb-badge-count">{rootTasks.length}</span>
              {sortedGroups.length > 1 && (
                <button
                  type="button"
                  className="mb-comment-btn"
                  style={{ marginLeft: "auto", color: "var(--danger)" }}
                  onClick={() => handleDeleteGroup(group.id)}
                  aria-label={`Eliminar grupo ${group.name}`}
                >
                  <IconTrash />
                </button>
              )}
            </div>
            <div className="mb-cols">
              <span>Tarea</span>
              <span style={{ textAlign: "center" }}>Personas</span>
              <span style={{ textAlign: "center" }}>Estado</span>
              <span style={{ textAlign: "center" }}>Fechas</span>
              <span />
            </div>
            {rootTasks.map((t) => (
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
            {!rootTasks.length && (
              <div className="text-sm" style={{ padding: "12px", color: "var(--muted)" }}>
                Sin tareas en este grupo — arrastra una tarea aquí o agrega una nueva abajo. ✨
              </div>
            )}
            <QuickAddRow projectId={projectId} groupId={group.id} placeholder="+ Agregar tarea" onCreated={handleTaskCreated} />
          </div>
        );
      })}
      <div className="mb-quickadd" style={{ border: "1px dashed var(--line)", borderRadius: 12, marginTop: 6 }}>
        <IconPlus />
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
          placeholder="+ Nuevo grupo"
          style={{ border: "none", background: "transparent", minHeight: "auto", padding: "4px 6px", width: "100%" }}
        />
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
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      style={{
        background: "transparent",
        border: "none",
        font: "inherit",
        fontWeight: 800,
        color: "inherit",
        minHeight: "auto",
        padding: "2px 4px",
        width: "auto",
        maxWidth: 220
      }}
    />
  );
}
