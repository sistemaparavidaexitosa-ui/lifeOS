"use client";
// Vista Kanban: una columna por estado, con límite WIP y arrastre entre
// columnas. Ahora comparte estado, filtros y selección con el resto de las
// vistas (recibe `api` y las tareas ya filtradas por BoardShell) y muestra
// las mismas señales visuales que el tablero: color de grupo, prioridad,
// responsables, vencimiento en rojo y conteo de subtareas.
//
// La persistencia sigue pasando por setTaskStatus, así que la máquina de
// estados (FR-EXE-003/004/005) y la regla de dependencias abiertas
// (BR-014) se aplican igual que en el resto de la app: si el servidor
// rechaza el movimiento, la tarjeta vuelve a su columna.
import { useMemo, useState, useTransition } from "react";
import { isOverdue, sortTasks } from "@/lib/domain/board.ts";
import { setTaskStatus } from "./actions";
import { STATUS_META, STATUS_ORDER, PRIORITY_META } from "./status-meta";
import { AvatarStack } from "@/components/ui";
import type { TaskStatus } from "@/lib/domain/types.ts";
import type { BoardApi, BoardTask } from "./board-types";

/** Límite WIP por columna: solo advierte (chip rojo), nunca bloquea el drop. */
const WIP_LIMIT: Partial<Record<TaskStatus, number>> = { InProgress: 4 };

export default function KanbanBoard({ api, tasks, today }: { api: BoardApi; tasks: BoardTask[]; today: string }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<TaskStatus | null>(null);
  const [, startTransition] = useTransition();

  const groupById = useMemo(() => new Map(api.groups.map((g) => [g.id, g])), [api.groups]);

  const byColumn = useMemo(() => {
    const map = new Map<TaskStatus, BoardTask[]>(STATUS_ORDER.map((s) => [s, []]));
    for (const t of sortTasks(tasks, "manual")) map.get(t.status)?.push(t);
    return map;
  }, [tasks]);

  const childCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.parentTaskId) counts[t.parentTaskId] = (counts[t.parentTaskId] ?? 0) + 1;
    }
    return counts;
  }, [tasks]);

  function handleDrop(newStatus: TaskStatus) {
    const taskId = dragId;
    setDragId(null);
    setDropColumn(null);
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    const previous = task.status;
    api.setStatus(taskId, newStatus);
    api.reportError(null);
    startTransition(async () => {
      try {
        await setTaskStatus(taskId, newStatus);
      } catch (e) {
        api.setStatus(taskId, previous);
        api.reportError(e instanceof Error ? e.message : "No se pudo mover la tarea");
      }
    });
  }

  return (
    <div className="kb-board">
      {STATUS_ORDER.map((status) => {
        const list = byColumn.get(status) ?? [];
        const limit = WIP_LIMIT[status];
        const overLimit = limit != null && list.length > limit;
        const meta = STATUS_META[status];
        return (
          <section
            key={status}
            className={`kb-col${dropColumn === status ? " dragover" : ""}`}
            style={{ "--col-color": meta.color } as React.CSSProperties}
            onDragOver={(e) => {
              e.preventDefault();
              setDropColumn(status);
            }}
            onDragLeave={() => setDropColumn((cur) => (cur === status ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(status);
            }}
          >
            <header className="kb-col-head">
              <b>{meta.label}</b>
              <span className={overLimit ? "chip bad" : "chip"}>
                {list.length}
                {limit != null ? ` / ${limit}` : ""}
              </span>
            </header>
            {overLimit && <p className="kb-wip text-xs">Límite WIP superado</p>}

            <div className="kb-cards">
              {list.map((t) => {
                const group = t.groupId ? groupById.get(t.groupId) : undefined;
                const late = isOverdue(t, today);
                const subs = childCount[t.id] ?? 0;
                return (
                  <article
                    key={t.id}
                    className={`kb-card${dragId === t.id ? " dragging" : ""}${api.selected.has(t.id) ? " selected" : ""}`}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <div className="kb-card-top">
                      <input
                        type="checkbox"
                        className="mb-check"
                        checked={api.selected.has(t.id)}
                        onChange={(e) => api.toggleSelected(t.id, e.target.checked)}
                        aria-label={`Seleccionar ${t.title}`}
                      />
                      <button type="button" className="kb-card-title" onClick={() => api.openDetail(t.id)}>
                        {t.title}
                      </button>
                    </div>
                    {group && (
                      <span className="kb-group" style={{ color: group.color }}>
                        ● {group.name}
                      </span>
                    )}
                    <div className="kb-card-meta">
                      <span
                        className="mb-pill soft kb-pill"
                        style={{ background: PRIORITY_META[t.priority].soft, color: PRIORITY_META[t.priority].color }}
                      >
                        {t.urgent ? "⚡ " : ""}
                        {PRIORITY_META[t.priority].label}
                      </span>
                      {subs > 0 && <span className="mb-badge-count">{subs} sub</span>}
                      <span className={`kb-due${late ? " overdue" : ""}`}>
                        {t.due ? new Date(`${t.due}T00:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "sin fecha"}
                      </span>
                    </div>
                    <AvatarStack names={api.assigneesByTask[t.id] ?? []} />
                  </article>
                );
              })}
              {!list.length && <p className="kb-empty text-xs">Sin tareas</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
