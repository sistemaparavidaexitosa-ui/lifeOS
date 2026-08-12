"use client";

import { useState, useTransition } from "react";
import { closeoutTask, saveDailyLearning } from "./actions";

interface TaskLite {
  id: string;
  title: string;
  status: string;
}

export default function CloseoutPanel({ impactTasks }: { impactTasks: TaskLite[] }) {
  const [learning, setLearning] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (!impactTasks.length) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>No tienes tareas de impacto marcadas hoy.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {impactTasks.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2">
          <span className="text-sm truncate">{t.title}</span>
          <div className="flex gap-1">
            {(["Completed", "Rescheduled", "Blocked"] as const).map((s) => (
              <form
                key={s}
                action={(fd) =>
                  startTransition(async () => {
                    fd.set("taskId", t.id);
                    fd.set("status", s);
                    await closeoutTask(fd);
                  })
                }
              >
                <button className="btn-ghost btn-sm" disabled={pending} type="submit">
                  {s === "Completed" ? "Hecho" : s === "Rescheduled" ? "Reprog." : "Bloq."}
                </button>
              </form>
            ))}
          </div>
        </div>
      ))}
      <div className="field">
        <label className="block text-xs font-bold mb-1">¿Qué aprendiste hoy?</label>
        <textarea value={learning} onChange={(e) => setLearning(e.target.value)} />
      </div>
      <button
        className="btn-primary"
        disabled={pending || done}
        onClick={() =>
          startTransition(async () => {
            await saveDailyLearning(learning);
            setDone(true);
          })
        }
      >
        {done ? "Día cerrado ✓" : "Cerrar día"}
      </button>
    </div>
  );
}
