"use client";
// Punto 2 — Formulario de "Editar proyecto", embebido en el Drawer del
// ProjectMenu. Reutiliza la Server Action updateProject (actions.ts). Mismo
// patrón de manejo de errores/pending que el resto de formularios del módulo.
import { useState, useTransition } from "react";
import { updateProject } from "./actions";
import type { ProjectMenuData } from "./ProjectMenu";

export default function EditProjectForm({ project, onSaved }: { project: ProjectMenuData; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            fd.set("projectId", project.id);
            await updateProject(fd);
            setError(null);
            onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <label className="text-xs" style={{ color: "var(--muted)", fontWeight: 700 }}>
        Título
      </label>
      <input name="title" defaultValue={project.title} required />

      <label className="text-xs" style={{ color: "var(--muted)", fontWeight: 700 }}>
        Objetivo
      </label>
      <textarea name="objective" defaultValue={project.objective} rows={3} />

      <label className="text-xs" style={{ color: "var(--muted)", fontWeight: 700 }}>
        Estado
      </label>
      <select name="status" defaultValue={project.status}>
        <option value="Draft">Borrador</option>
        <option value="Active">Activo</option>
        <option value="OnHold">En pausa</option>
        <option value="Completed">Completado</option>
        <option value="Cancelled">Cancelado</option>
        <option value="Archived">Archivado</option>
      </select>

      <label className="text-xs" style={{ color: "var(--muted)", fontWeight: 700 }}>
        Prioridad
      </label>
      <select name="priority" defaultValue={project.priority}>
        <option value="High">Alta</option>
        <option value="Medium">Media</option>
        <option value="Low">Baja</option>
      </select>

      <label className="text-xs" style={{ color: "var(--muted)", fontWeight: 700 }}>
        Fecha meta
      </label>
      <input name="targetDate" type="date" defaultValue={project.targetDate ?? ""} />

      {error && <div className="chip danger">{error}</div>}

      <button type="submit" className="btn-primary btn-sm" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
