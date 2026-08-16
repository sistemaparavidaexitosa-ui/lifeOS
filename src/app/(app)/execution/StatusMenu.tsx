"use client";

// Pill de estado coloreado (estilo monday.com: Sin empezar/Trabajando/
// Bloqueada/Reprogramada/Hecho/Cancelada). Reutiliza setTaskStatus, la MISMA
// Server Action de TaskStatusButtons.tsx/KanbanBoard.tsx — así la máquina de
// estados y la validación de dependencias abiertas (FR-EXE-005) se respetan
// también aquí. Solo muestra las transiciones permitidas por TASK_TRANSITIONS.

import { useState, useTransition } from "react";
import { setTaskStatus } from "./actions";
import { STATUS_META, TASK_TRANSITIONS } from "./status-meta";
import type { TaskStatus } from "@/lib/domain/types.ts";

export default function StatusMenu({
  taskId,
  status,
  onChange
}: {
  taskId: string;
  status: TaskStatus;
  onChange: (s: TaskStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const allowed = TASK_TRANSITIONS[status];
  const meta = STATUS_META[status];

  function choose(to: TaskStatus) {
    setOpen(false);
    const prevStatus = status;
    onChange(to);
    startTransition(async () => {
      try {
        await setTaskStatus(taskId, to);
        setError(null);
      } catch (e) {
        onChange(prevStatus);
        setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
      }
    });
  }

  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
      <button
        type="button"
        className="mb-pill"
        style={{ background: meta.color, opacity: pending ? 0.7 : 1, cursor: allowed.length ? "pointer" : "default" }}
        onClick={() => allowed.length > 0 && setOpen((v) => !v)}
      >
        {meta.label}
      </button>
      {open && (
        <div className="card" style={{ position: "absolute", zIndex: 45, top: 36, left: 0, minWidth: 170, padding: 6, boxShadow: "var(--shadow)" }}>
          {allowed.map((to) => (
            <button
              key={to}
              type="button"
              onClick={() => choose(to)}
              className="mb-pill"
              style={{ background: STATUS_META[to].color, width: "100%", marginBottom: 4 }}
            >
              {STATUS_META[to].label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div className="text-xs" style={{ color: "var(--danger)", position: "absolute", top: 36, whiteSpace: "nowrap" }}>
          {error}
        </div>
      )}
    </div>
  );
}
