"use client";

import { useRef, useTransition } from "react";
import { createTask } from "./actions";

export default function NewTaskForm({ projectId }: { projectId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={ref}
      action={(fd) => startTransition(async () => {
        await createTask(fd);
        ref.current?.reset();
      })}
      className="flex flex-wrap gap-2 items-center mt-2"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input name="title" placeholder="Nueva tarea…" required className="flex-1 min-w-[160px]" />
      <select name="priority" defaultValue="Medium" style={{ width: 110 }}>
        <option value="High">Alta</option>
        <option value="Medium">Media</option>
        <option value="Low">Baja</option>
      </select>
      <input name="due" type="date" style={{ width: 150 }} />
      <input name="est" type="number" defaultValue={30} min={0} style={{ width: 90 }} title="minutos estimados" />
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="impact" style={{ width: "auto", minHeight: "auto" }} /> Impacto
      </label>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="urgent" style={{ width: "auto", minHeight: "auto" }} /> Urgente
      </label>
      <button className="btn-primary btn-sm" disabled={pending} type="submit">
        {pending ? "…" : "+ Tarea"}
      </button>
    </form>
  );
}
