"use client";
// FIX: antes este formulario se renderizaba SIEMPRE visible (única
// inconsistencia del proyecto frente al resto de formularios — DebtForm,
// CashbackForm, GoalForm, HabitForm, etc. — que ya usan el patrón botón
// "+ X" que abre/cierra). Ahora sigue exactamente ese mismo patrón: botón
// que abre el formulario y se cierra solo al crear (o al cancelar).
import { useRef, useState, useTransition } from "react";
import { createProject } from "./actions";

export default function NewProjectForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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
          await createProject(fd);
          ref.current?.reset();
          setOpen(false);
        })
      }
      className="card flex flex-col gap-2"
    >
      <b>+ Nuevo proyecto</b>
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
