"use client";

import { useState, useTransition } from "react";
import { assignTaskToSlot } from "./actions";

interface TaskLite {
  id: string;
  title: string;
  est: number;
}

export default function AssignSlotButton({ slotLabel, tasks }: { slotLabel: string; tasks: TaskLite[] }) {
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  if (!tasks.length) {
    return (
      <button className="btn-ghost btn-sm" disabled>
        Sin tareas pendientes
      </button>
    );
  }

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Asignar tarea
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select value={taskId} onChange={(e) => setTaskId(e.target.value)} style={{ minWidth: 160 }}>
        {tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title} ({t.est}m)
          </option>
        ))}
      </select>
      <button
        className="btn-primary btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await assignTaskToSlot(taskId);
            setOpen(false);
          })
        }
      >
        {pending ? "…" : `Asignar a ${slotLabel}`}
      </button>
      <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
        ✕
      </button>
    </div>
  );
}
