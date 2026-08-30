"use client";
// FIX: antes este formulario se renderizaba SIEMPRE visible (única
// inconsistencia del proyecto frente al resto de formularios — DebtForm,
// CashbackForm, GoalForm, HabitForm, etc. — que ya usan el patrón botón
// "+ X" que abre/cierra). Ahora sigue exactamente ese mismo patrón: botón
// que abre el formulario y se cierra solo al crear (o al cancelar).
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "./actions";
import { TemplateSelect, TemplatePreview } from "./ProjectTemplatePicker";

export default function NewProjectForm({
  workspaceId,
  workspaceName
}: {
  /**
   * Espacio donde nace el proyecto. Obligatorio desde la migración 0030:
   * `projects.workspace_id` es NOT NULL y ya no existe el proyecto "suelto".
   */
  workspaceId: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");

  if (!open) {
    return (
      <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>
        + Nuevo proyecto
      </button>
    );
  }

  return (
    <form
      ref={ref}
      action={(fd) =>
        startTransition(async () => {
          try {
            const projectId = await createProject(fd);
            ref.current?.reset();
            setOpen(false);
            setError(null);
            // Directo a su tablero: ahí ya está el grupo "General" y su
            // "+ Agregar tarea". Antes había que localizar el proyecto recién
            // creado en la cartera y abrirlo a mano para poder empezar.
            router.push(`/execution?project=${projectId}`);
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo crear el proyecto");
          }
        })
      }
      className="card flex flex-col gap-2"
    >
      <b>+ Nuevo proyecto</b>
      {/* Decir dónde va a caer el proyecto ANTES de crearlo: con varios
          espacios abiertos en pestañas distintas, crear a ciegas y descubrir
          después que el equipo entero lo ve (o que nadie lo ve) es el error
          caro de este formulario. */}
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        En el espacio <b>{workspaceName}</b>
      </span>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input name="title" placeholder="Título del proyecto" required />
      <input name="objective" placeholder="Objetivo (opcional)" />
      <div style={{ display: "flex", gap: 8 }}>
        <select name="status" defaultValue="Active" style={{ flex: 1 }}>
          <option value="Draft">Borrador</option>
          <option value="Active">Activo</option>
          <option value="OnHold">En pausa</option>
        </select>
        <select name="priority" defaultValue="Medium" style={{ flex: 1 }}>
          <option value="High">Alta</option>
          <option value="Medium">Media</option>
          <option value="Low">Baja</option>
        </select>
      </div>
      <input name="targetDate" type="date" />

      {/* La plantilla va al final y no arriba: primero se decide QUÉ proyecto
          es, y solo entonces tiene sentido preguntar con qué estructura nace.
          Por defecto ninguna — un proyecto sigue pudiendo empezar en blanco. */}
      <label className="text-xs font-bold">
        Plantilla
        <TemplateSelect name="templateId" value={templateId} onChange={setTemplateId} />
      </label>
      <TemplatePreview templateId={templateId} />

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending} style={{ flex: 1 }}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={pending} style={{ flex: 1 }}>
          {pending ? "Creando…" : "Crear proyecto"}
        </button>
      </div>
    </form>
  );
}
