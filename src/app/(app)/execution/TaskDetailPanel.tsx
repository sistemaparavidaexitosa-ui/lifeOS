"use client";
// Drawer lateral de detalle de tarea (equivalente a openTask() en LifeOS
// 4.html, ahora rediseñado Monday-style — FASE 3). Orquesta: edición de
// campos básicos, descripción, estado (TaskStatusButtons), responsables,
// dependencias, archivos, comentarios/menciones e historial.
//
// FASE 3 — cambio de comportamiento: el contenido ya NO se expande inline
// debajo del botón "Ver detalle"; se renderiza como un Drawer lateral real
// (overlay fixed-right con backdrop, clases .td-* en globals.css), sin
// navegar a otra página. Todos los call-sites existentes (MondayRow.tsx,
// KanbanBoard.tsx, TaskTable.tsx, execution/page.tsx vista Lista) siguen
// funcionando SIN cambios, salvo MondayRow.tsx (ver más abajo).
//
// Modo controlado (nuevo, opcional): si se pasan `open`/`onOpenChange`, el
// componente NO renderiza su propio botón disparador — usa el estado del
// padre. Esto corrige un bug real detectado en MondayRow.tsx: su ícono de
// comentario montaba/desmontaba este componente por completo (obligando a
// un SEGUNDO clic para ver el contenido, porque el componente recién
// montado siempre arrancaba con su propio `open` interno en false). Con
// modo controlado, MondayRow mantiene el componente siempre montado y
// controla su visibilidad directamente — un solo clic abre el Drawer.
import { useEffect, useState, useTransition } from "react";
import { getTaskDetail, updateTaskDetails, type TaskDetailResult } from "./task-detail-actions";
import TaskStatusButtons from "./TaskStatusButtons";
import AssigneesField from "./AssigneesField";
import DepsField from "./DepsField";
import TaskCommentsPanel from "./TaskCommentsPanel";
import TaskHistoryPanel from "./TaskHistoryPanel";
import TaskDescriptionField from "./TaskDescriptionField";
import TaskFilesPanel from "./TaskFilesPanel";
import { IconClose } from "@/components/icons";

export default function TaskDetailPanel({
  taskId,
  taskTitle,
  compact = false,
  open: controlledOpen,
  onOpenChange
}: {
  taskId: string;
  taskTitle: string;
  compact?: boolean;
  /** Modo controlado (opcional): ver nota arriba. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen! : internalOpen;
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

  function setOpen(next: boolean) {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  }

  function toggle() {
    const next = !open;
    if (next && !detail) load();
    setOpen(next);
  }

  // Modo controlado: si el padre abre el Drawer (p. ej. MondayRow al hacer
  // clic en el ícono de comentario) y todavía no hay datos cargados, los
  // carga aquí mismo — el padre no necesita saber nada de getTaskDetail.
  useEffect(() => {
    if (isControlled && open && !detail && !pending) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isControlled, open]);

  return (
    <>
      {!isControlled && (
        <div>
          {!compact && <b>{taskTitle}</b>}
          <button type="button" className="btn-ghost btn-sm" onClick={toggle}>
            {pending && !detail ? "Cargando…" : open ? "Cerrar detalle" : "Ver detalle"}
          </button>
          {error && !open && (
            <div className="chip danger" style={{ marginTop: 6 }}>
              {error}
            </div>
          )}
        </div>
      )}
      {open && (
        <>
          <div className="td-backdrop" onClick={() => setOpen(false)} />
          <aside className="td-drawer" role="dialog" aria-modal="true" aria-label={`Detalle de ${taskTitle}`}>
            <div className="td-drawer-header">
              <b className="td-drawer-title">{taskTitle}</b>
              <button type="button" className="td-drawer-close" onClick={() => setOpen(false)} aria-label="Cerrar detalle">
                <IconClose />
              </button>
            </div>
            <div className="td-drawer-body">
              {pending && !detail && (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Cargando…
                </p>
              )}
              {error && <div className="chip danger">{error}</div>}
              {detail && (
                <>
                  <EditFieldsForm detail={detail} onSaved={load} />
                  <TaskDescriptionField taskId={detail.task.id} description={detail.task.description} onSaved={load} />
                  <TaskStatusButtons taskId={detail.task.id} status={detail.task.status} />
                  <AssigneesField taskId={detail.task.id} members={detail.members} selected={detail.assignees} onSaved={load} />
                  <DepsField taskId={detail.task.id} candidates={detail.depCandidates} selected={detail.task.deps} onSaved={load} />
                  <TaskFilesPanel taskId={detail.task.id} files={detail.files} onSaved={load} />
                  <TaskCommentsPanel taskId={detail.task.id} comments={detail.comments} onSaved={load} />
                  <TaskHistoryPanel history={detail.history} />
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </>
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
      <input name="title" defaultValue={detail.task.title} placeholder="Título" required />
      <select name="priority" defaultValue={detail.task.priority}>
        <option value="High">Alta</option>
        <option value="Medium">Media</option>
        <option value="Low">Baja</option>
      </select>
      <input name="due" type="date" defaultValue={detail.task.due ?? ""} />
      <input name="est" type="number" min={0} defaultValue={detail.task.est} placeholder="Estimado (min)" />
      <label className="flex items-center gap-2" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input name="impact" type="checkbox" defaultChecked={detail.task.impact} style={{ width: "auto", minHeight: "auto" }} />
        Impacto
      </label>
      <label className="flex items-center gap-2" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input name="urgent" type="checkbox" defaultChecked={detail.task.urgent} style={{ width: "auto", minHeight: "auto" }} />
        Urgente
      </label>
      {error && (
        <div className="chip danger">
          {error}
        </div>
      )}
      <button type="submit" className="btn-primary btn-sm" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
      {savedMsg && (
        <div className="chip ok">
          {savedMsg}
        </div>
      )}
    </form>
  );
}
