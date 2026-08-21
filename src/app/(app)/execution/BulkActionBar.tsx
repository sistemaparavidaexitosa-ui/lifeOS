"use client";
// Barra flotante de acciones masivas (monday.com/ClickUp la muestran al pie
// cuando hay filas seleccionadas). Antes cada cambio era tarea por tarea:
// mover 12 tareas de grupo eran 12 arrastres.
//
// El cambio de estado masivo NO fuerza transiciones: bulkSetTaskStatus
// valida cada tarea con la misma máquina de estados del servidor y devuelve
// los rechazos, que aquí se muestran al usuario en vez de silenciarse.
import { useState, useTransition } from "react";
import { bulkDeleteTasks, bulkMoveToGroup, bulkSetTaskStatus } from "./board-actions";
import { STATUS_META, STATUS_ORDER } from "./status-meta";
import { subtreeIds } from "@/lib/domain/board.ts";
import type { TaskStatus } from "@/lib/domain/types.ts";
import type { BoardApi, BoardTask } from "./board-types";

export default function BulkActionBar({
  api,
  tasks,
  onTasksChange
}: {
  api: BoardApi;
  tasks: BoardTask[];
  onTasksChange: (updater: (prev: BoardTask[]) => BoardTask[]) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const ids = [...api.selected];
  if (!ids.length) return null;

  function applyStatus(status: TaskStatus) {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await bulkSetTaskStatus(ids, status);
        onTasksChange((prev) => prev.map((t) => (result.updated.includes(t.id) ? { ...t, status } : t)));
        if (result.failures.length) {
          setNotice(`${result.updated.length} actualizadas · ${result.failures.length} rechazadas: ${result.failures[0]!.message}`);
        } else {
          api.clearSelection();
        }
      } catch (e) {
        api.reportError(e instanceof Error ? e.message : "No se pudo aplicar el cambio masivo");
      }
    });
  }

  function moveToGroup(groupId: string) {
    if (!groupId) return;
    setNotice(null);
    startTransition(async () => {
      try {
        await bulkMoveToGroup(ids, groupId);
        onTasksChange((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, groupId, parentTaskId: null } : t)));
        api.clearSelection();
      } catch (e) {
        api.reportError(e instanceof Error ? e.message : "No se pudieron mover las tareas");
      }
    });
  }

  function removeSelected() {
    if (!window.confirm(`¿Eliminar ${ids.length} tarea(s) y sus subtareas? Esta acción no se puede deshacer.`)) return;
    setNotice(null);
    startTransition(async () => {
      try {
        await bulkDeleteTasks(ids);
        const removing = new Set(ids.flatMap((id) => subtreeIds(tasks, id)));
        onTasksChange((prev) => prev.filter((t) => !removing.has(t.id)));
        api.clearSelection();
      } catch (e) {
        api.reportError(e instanceof Error ? e.message : "No se pudieron eliminar las tareas");
      }
    });
  }

  return (
    <div className="ex-bulkbar" role="region" aria-label="Acciones sobre la selección">
      <b>{ids.length} seleccionada(s)</b>
      <div className="ex-bulk-actions">
        <label className="text-xs">
          Estado
          <select
            defaultValue=""
            disabled={pending}
            onChange={(e) => {
              const value = e.target.value as TaskStatus | "";
              e.currentTarget.value = "";
              if (value) applyStatus(value);
            }}
          >
            <option value="">Cambiar a…</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Grupo
          <select
            defaultValue=""
            disabled={pending}
            onChange={(e) => {
              const value = e.target.value;
              e.currentTarget.value = "";
              moveToGroup(value);
            }}
          >
            <option value="">Mover a…</option>
            {api.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-ghost btn-sm danger" onClick={removeSelected} disabled={pending}>
          Eliminar
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={api.clearSelection} disabled={pending}>
          Cancelar
        </button>
      </div>
      {notice && <span className="ex-bulk-notice text-xs">{notice}</span>}
    </div>
  );
}
