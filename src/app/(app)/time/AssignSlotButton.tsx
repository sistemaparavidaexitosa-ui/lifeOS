"use client";

import { useState, useTransition } from "react";
import { assignTaskToDate } from "./actions";

interface TaskLite {
  id: string;
  title: string;
  est: number;
}

/**
 * FR-TIM-007 (generalizado a cualquier día): ahora recibe `date` explícito
 * como prop (antes asignaba implícitamente a "hoy" dentro del servidor). La
 * vista del día le pasa el día actual; la vista semanal le pasa el día de
 * la columna correspondiente (ver DayEditor.tsx).
 */
export default function AssignSlotButton({ slotLabel, tasks, date }: { slotLabel: string; tasks: TaskLite[]; date: string }) {
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  if (!tasks.length) {
    return (
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        Sin tareas pendientes
      </span>
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
    <div className="row" style={{ display: "flex", gap: 6, alignItems: "center" }}>
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
            await assignTaskToDate(taskId, date);
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
