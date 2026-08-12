"use client";

import { useRef, useTransition } from "react";
import { createProject } from "./actions";

export default function NewProjectForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={ref}
      action={(fd) => startTransition(async () => {
        await createProject(fd);
        ref.current?.reset();
      })}
      className="card flex flex-col gap-2"
    >
      <b className="text-sm">+ Nuevo proyecto</b>
      <input name="title" placeholder="Título del proyecto" required />
      <input name="objective" placeholder="Objetivo (opcional)" />
      <div className="grid grid-cols-2 gap-2">
        <select name="priority" defaultValue="Medium">
          <option value="High">Alta</option>
          <option value="Medium">Media</option>
          <option value="Low">Baja</option>
        </select>
        <input name="targetDate" type="date" />
      </div>
      <button className="btn-primary btn-sm" disabled={pending} type="submit">
        {pending ? "Creando…" : "Crear proyecto"}
      </button>
    </form>
  );
}
