"use client";

// FASE 1 — Panel/modal de detalle de tarea (equivalente a openTask() en
// LifeOS 4.html). Orquesta: edición de campos básicos, cambio de estado
// (reutiliza TaskStatusButtons ya existente), responsables, dependencias,
// comentarios/menciones e historial.
//
// Patrón: toggle inline (igual que CashbackForm.tsx/DebtForm.tsx/etc. del
// repo), no un overlay flotante — consistente con el resto de la app, que
// no porta el sistema de modales del HTML sino que usa expansión inline.
//
// Los datos se cargan bajo demanda (al abrir) vía Server Action
// getTaskDetail(), igual que el patrón ya usado en SequenceButton.tsx
// (requestProjectSequence). Esto evita tener que reestructurar
// execution/page.tsx para pre-cargar assignees/comments/history de TODAS las
// tareas visibles (que sería mucho más costoso en queries).

import { useState, useTransition } from "react";
import {
  getTaskDetail,
  updateTaskDetails,
  type TaskDetailResult
} from "./task-detail-actions";
import TaskStatusButtons from "./TaskStatusButtons";
import AssigneesField from "./AssigneesField";
import DepsField from "./DepsField";
import TaskCommentsPanel from "./TaskCommentsPanel";
import TaskHistoryPanel from "./TaskHistoryPanel";

export default function TaskDetailPanel({ taskId, taskTitle }: { taskId: string; taskTitle: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TaskDetailResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function load() {
    startTransition(async () => {
      try {
        const d = await getTaskDetail(taskId);
        setDetail(d);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar la tarea");
      }
    });
  }

  function toggle() {
    if (!open) load();
    setOpen(!open);
  }

  return (
    <div className="card" style={{ marginTop: 8, background: "var(--surface2)" }}>
      <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between" }}>
        <b className="text-sm">{taskTitle}</b>
        <button className="btn-ghost btn-sm" onClick={toggle} disabled={pending}>
          {pending ? "Cargando…" : open ? "Cerrar" : "Ver detalle"}
        </button>
      </div>
      {error && (
        <div className="text-xs" style={{ color: "var(--danger)", marginTop: 6 }}>
          {error}
        </div>
      )}
      {open && detail && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <EditFieldsForm detail={detail} onSaved={load} />
          <div style={{ marginTop: 4 }}>
            <TaskStatusButtons taskId={detail.task.id} status={detail.task.status} />
          </div>
          <AssigneesField
            taskId={detail.task.id}
            members={detail.members}
            selected={detail.assignees}
            onSaved={load}
          />
          <DepsField
            taskId={detail.task.id}
            candidates={detail.depCandidates}
            selected={detail.task.deps}
            onSaved={load}
          />
          <TaskCommentsPanel taskId={detail.task.id} comments={detail.comments} onSaved={load} />
          <TaskHistoryPanel history={detail.history} />
        </div>
      )}
    </div>
  );
}

function EditFieldsForm({ detail, onSaved }: { detail: TaskDetailResult; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            fd.set("taskId", detail.task.id);
            await updateTaskDetails(fd);
            setError(null);
            setSavedMsg("Cambios guardados");
            onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <input name="title" defaultValue={detail.task.title} required />
      <div className="grid grid-cols-2 gap-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <select name="priority" defaultValue={detail.task.priority}>
          <option value="High">Alta</option>
          <option value="Medium">Media</option>
          <option value="Low">Baja</option>
        </select>
        <input name="due" type="date" defaultValue={detail.task.due ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input name="est" type="number" min={0} defaultValue={detail.task.est} />
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label className="row sm" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name="impact" defaultChecked={detail.task.impact} style={{ width: "auto" }} />
            Impacto
          </label>
          <label className="row sm" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name="urgent" defaultChecked={detail.task.urgent} style={{ width: "auto" }} />
            Urgente
          </label>
        </div>
      </div>
      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        {savedMsg && (
          <span className="chip ok" style={{ fontSize: 11 }}>
            {savedMsg}
          </span>
        )}
      </div>
    </form>
  );
}
