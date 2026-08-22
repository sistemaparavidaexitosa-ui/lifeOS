"use client";
// Vista "Tablero" (monday.com): Grupo → Tarea → Subtarea, con columnas
// editables inline, arrastre para reordenar/mover/anidar y alta rápida por
// grupo.
//
// Cambios de este rediseño respecto a la versión anterior:
//   1. Ya NO tiene estado propio: recibe `tasks` (ya filtradas y ordenadas
//      por BoardShell) y muta a través de `api`. Antes cada vista mantenía
//      una copia divergente de las mismas tareas.
//   2. Grupos colapsables, con barra de progreso, distribución de estados y
//      color editable — antes el encabezado solo mostraba nombre y conteo.
//   3. Arrastre real de 3 modos, como ClickUp: soltar en la mitad superior
//      de una fila = insertar antes, mitad inferior = insertar después,
//      centro = convertir en subtarea (con guarda anti-ciclos).
//   4. Selección múltiple con casilla por fila y por grupo, que alimenta la
//      barra de acciones masivas (BulkActionBar).
import { useEffect, useMemo, useState } from "react";
import { reorderIds, sortTasks, isDescendantOf, type SortKey } from "@/lib/domain/board.ts";
import type { BoardApi, BoardGroup, BoardTask, MoveTarget } from "./board-types";
import GroupHeader from "./GroupHeader";
import MondayRow from "./MondayRow";
import QuickAddRow from "./QuickAddRow";
import { createTaskGroup, deleteTaskGroup, renameTaskGroup } from "./tree-actions";
import { reorderGroups, setGroupColor } from "./board-actions";
import { IconPlus } from "@/components/icons";

export type DropMode = "before" | "after" | "child";

export interface DropHint {
  taskId: string;
  mode: DropMode;
}

export default function MondayBoard({
  api,
  tasks,
  sort,
  onGroupsChange,
  siblingsOf
}: {
  api: BoardApi;
  tasks: BoardTask[];
  sort: SortKey;
  onGroupsChange: (updater: (prev: BoardGroup[]) => BoardGroup[]) => void;
  siblingsOf: (target: MoveTarget) => BoardTask[];
}) {
  const [newGroupName, setNewGroupName] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);

  // El colapso de grupos es preferencia de lectura del usuario, no dato del
  // proyecto: vive en localStorage por proyecto, no en la base.
  const storageKey = `lifeos.board.collapsed.${api.projectId}`;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      // localStorage puede estar bloqueado (modo privado): no es crítico.
    }
  }, [storageKey]);

  function toggleCollapsed(groupId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // idem
      }
      return next;
    });
  }

  const childrenMap = useMemo(() => {
    const map: Record<string, BoardTask[]> = {};
    for (const t of tasks) {
      if (!t.parentTaskId) continue;
      (map[t.parentTaskId] ??= []).push(t);
    }
    for (const key of Object.keys(map)) map[key] = sortTasks(map[key]!, sort);
    return map;
  }, [tasks, sort]);

  const rootsByGroup = useMemo(() => {
    const map: Record<string, BoardTask[]> = {};
    for (const t of tasks) {
      if (t.parentTaskId) continue;
      (map[t.groupId ?? "__ungrouped__"] ??= []).push(t);
    }
    for (const key of Object.keys(map)) map[key] = sortTasks(map[key]!, sort);
    return map;
  }, [tasks, sort]);

  const sortedGroups = useMemo(() => [...api.groups].sort((a, b) => a.position - b.position), [api.groups]);

  // -------------------------------------------------------------------------
  // Arrastre de tareas
  // -------------------------------------------------------------------------

  function endDrag() {
    setDragTaskId(null);
    setDropHint(null);
    setDropGroupId(null);
  }

  function handleDropOnRow(target: BoardTask, mode: DropMode) {
    const movedId = dragTaskId;
    endDrag();
    if (!movedId || movedId === target.id) return;

    if (mode === "child") {
      if (isDescendantOf(tasks, movedId, target.id)) {
        api.reportError("No puedes anidar una tarea dentro de una de sus propias subtareas.");
        return;
      }
      const siblings = siblingsOf({ groupId: target.groupId, parentTaskId: target.id });
      const ordered = [...siblings.map((t) => t.id).filter((id) => id !== movedId), movedId];
      api.moveTask(movedId, { groupId: target.groupId, parentTaskId: target.id }, ordered);
      return;
    }

    if (isDescendantOf(tasks, movedId, target.id)) {
      api.reportError("No puedes mover una tarea dentro de su propio subárbol.");
      return;
    }
    const destination: MoveTarget = { groupId: target.groupId, parentTaskId: target.parentTaskId };
    const siblings = siblingsOf(destination);
    const ordered = reorderIds(siblings.map((t) => t.id), movedId, target.id, mode);
    api.moveTask(movedId, destination, ordered);
  }

  function handleDropOnGroup(groupId: string) {
    const movedId = dragTaskId;
    endDrag();
    if (!movedId) return;
    const destination: MoveTarget = { groupId, parentTaskId: null };
    const siblings = siblingsOf(destination);
    const ordered = [...siblings.map((t) => t.id).filter((id) => id !== movedId), movedId];
    api.moveTask(movedId, destination, ordered);
  }

  // -------------------------------------------------------------------------
  // Grupos
  // -------------------------------------------------------------------------

  function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    createTaskGroup({ projectId: api.projectId, name })
      .then((created) => {
        onGroupsChange((prev) => [...prev, created]);
        setNewGroupName("");
      })
      .catch((e) => api.reportError(e instanceof Error ? e.message : "No se pudo crear el grupo"));
  }

  function handleRenameGroup(groupId: string, name: string) {
    onGroupsChange((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
    renameTaskGroup(groupId, name).catch((e) =>
      api.reportError(e instanceof Error ? e.message : "No se pudo renombrar el grupo")
    );
  }

  function handleColorGroup(groupId: string, color: string) {
    onGroupsChange((prev) => prev.map((g) => (g.id === groupId ? { ...g, color } : g)));
    setGroupColor(groupId, color).catch((e) =>
      api.reportError(e instanceof Error ? e.message : "No se pudo cambiar el color del grupo")
    );
  }

  function handleDeleteGroup(groupId: string) {
    const fallback = sortedGroups.find((g) => g.id !== groupId);
    if (!fallback) return; // nunca se elimina el último grupo del tablero
    const count = (rootsByGroup[groupId] ?? []).length;
    const message = count
      ? `¿Eliminar el grupo? Sus ${count} tarea(s) se moverán a "${fallback.name}".`
      : "¿Eliminar el grupo?";
    if (!window.confirm(message)) return;
    onGroupsChange((prev) => prev.filter((g) => g.id !== groupId));
    for (const t of tasks) {
      if (t.groupId === groupId) api.patchTask(t.id, { groupId: fallback.id });
    }
    deleteTaskGroup(groupId, fallback.id).catch((e) =>
      api.reportError(e instanceof Error ? e.message : "No se pudo eliminar el grupo")
    );
  }

  function handleMoveGroup(groupId: string, direction: -1 | 1) {
    const index = sortedGroups.findIndex((g) => g.id === groupId);
    const swapWith = index + direction;
    if (index === -1 || swapWith < 0 || swapWith >= sortedGroups.length) return;
    const next = [...sortedGroups];
    const [moved] = next.splice(index, 1);
    next.splice(swapWith, 0, moved!);
    const repositioned = next.map((g, i) => ({ ...g, position: i }));
    onGroupsChange(() => repositioned);
    reorderGroups(api.projectId, repositioned.map((g) => g.id)).catch((e) =>
      api.reportError(e instanceof Error ? e.message : "No se pudo reordenar los grupos")
    );
  }

  return (
    <div className="mb-board" onDragEnd={endDrag}>
      {sortedGroups.map((group, index) => {
        const rootTasks = rootsByGroup[group.id] ?? [];
        const groupTasks = tasks.filter((t) => t.groupId === group.id);
        const isCollapsed = collapsed.has(group.id);
        const allSelected = groupTasks.length > 0 && groupTasks.every((t) => api.selected.has(t.id));
        return (
          <section
            key={group.id}
            className={`mb-group${dropGroupId === group.id ? " dragover" : ""}`}
            style={{ "--group-color": group.color } as React.CSSProperties}
            onDragOver={(e) => {
              if (!dragTaskId) return;
              e.preventDefault();
              setDropGroupId(group.id);
            }}
            onDragLeave={() => setDropGroupId((cur) => (cur === group.id ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              handleDropOnGroup(group.id);
            }}
          >
            <GroupHeader
              group={group}
              today={api.today}
              tasks={groupTasks}
              rootCount={rootTasks.length}
              collapsed={isCollapsed}
              allSelected={allSelected}
              canDelete={sortedGroups.length > 1}
              canMoveUp={index > 0}
              canMoveDown={index < sortedGroups.length - 1}
              onToggleCollapsed={() => toggleCollapsed(group.id)}
              onRename={(name) => handleRenameGroup(group.id, name)}
              onColor={(color) => handleColorGroup(group.id, color)}
              onDelete={() => handleDeleteGroup(group.id)}
              onMove={(direction) => handleMoveGroup(group.id, direction)}
              onSelectAll={(next) => api.selectMany(groupTasks.map((t) => t.id), next)}
            />

            {!isCollapsed && (
              <>
                <div className="mb-cols">
                  <span>Tarea</span>
                  <span className="mb-col-center">Personas</span>
                  <span className="mb-col-center">Estado</span>
                  <span className="mb-col-center">Prioridad</span>
                  <span className="mb-col-center">Fechas</span>
                </div>
                {rootTasks.map((t) => (
                  <MondayRow
                    key={t.id}
                    api={api}
                    task={t}
                    depth={0}
                    childrenMap={childrenMap}
                    dragTaskId={dragTaskId}
                    dropHint={dropHint}
                    onDragStart={setDragTaskId}
                    onDragHint={setDropHint}
                    onDropOnRow={handleDropOnRow}
                  />
                ))}
                {!rootTasks.length && (
                  <p className="mb-empty text-sm">
                    Sin tareas en este grupo — arrastra una aquí o escribe abajo para crear la primera. ✨
                  </p>
                )}
                <QuickAddRow
                  projectId={api.projectId}
                  groupId={group.id}
                  placeholder="+ Agregar tarea"
                  onCreated={api.taskCreated}
                />
              </>
            )}
          </section>
        );
      })}

      <div className="mb-newgroup">
        <IconPlus />
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
          placeholder="Nuevo grupo (Enter para crear)"
          aria-label="Nuevo grupo"
        />
      </div>
    </div>
  );
}
