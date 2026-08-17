"use client";
// FIX: mismo problema y mismo fix que NewProjectForm.tsx — el formulario
// estaba siempre visible en vez de ser un botón "+ Tarea" que abre/cierra,
// como el resto de formularios del proyecto.
import { useRef, useState, useTransition } from "react";
import { createTask } from "./actions";

export default function NewTaskForm({ projectId }: { projectId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        + Tarea
      </button>
    );
  }

  return (
    <form
      ref={ref}
      action={(fd) =>
        startTransition(async () => {
          fd.set("projectId", projectId);
          await createTask(fd);
          ref.current?.reset();
          setOpen(false);
        })
      }
      className="flex flex-wrap gap-2 items-center mt-2"
      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}
    >
      <input name="title" placeholder="Título de la tarea" required style={{ flex: "1 1 220px" }} />
      <select name="priority" defaultValue="Medium">
        <option value="High">Alta</option>
        <option value="Medium">Media</option>
        <option value="Low">Baja</option>
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input name="impact" type="checkbox" style={{ width: "auto", minHeight: "auto" }} />
        Impacto
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input name="urgent" type="checkbox" style={{ width: "auto", minHeight: "auto" }} />
        Urgente
      </label>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
        Cancelar
      </button>
      <button type="submit" className="btn-primary btn-sm" disabled={pending}>
        {pending ? "…" : "Crear tarea"}
      </button>
    </form>
  );
}
