"use client";

// FASE 1 — Dependencias (deps) de una tarea. La columna tasks.deps ya existía
// en el esquema y evaluateTransition() (src/lib/domain/task-state.ts) ya
// validaba "no completar con dependencias abiertas" (FR-EXE-005), pero no
// había checklist real en la UI para EDITAR esa relación tras crear la tarea
// — este componente cierra ese gap.

import { useState, useTransition } from "react";
import { setTaskDeps } from "./task-detail-actions";

interface DepCandidate {
  id: string;
  title: string;
  status: string;
}

export default function DepsField({
  taskId,
  candidates,
  selected,
  onSaved
}: {
  taskId: string;
  candidates: DepCandidate[];
  selected: string[];
  onSaved: () => void;
}) {
  const [checked, setChecked] = useState<string[]>(selected);
  const [pending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  function toggleDep(id: string) {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setSavedMsg(null);
  }

  return (
    <div className="card" style={{ background: "var(--surface)", marginTop: 8 }}>
      <b className="text-sm">Dependencias</b>
      <div className="text-xs" style={{ color: "var(--muted)", margin: "4px 0 8px" }}>
        No se puede completar esta tarea mientras alguna dependencia siga abierta (FR-EXE-005).
      </div>
      {candidates.length === 0 && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          No hay otras tareas en este proyecto.
        </div>
      )}
      {candidates.map((t) => (
        <label key={t.id} className="row sm" style={{ margin: "4px 0", display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={checked.includes(t.id)} onChange={() => toggleDep(t.id)} style={{ width: "auto" }} />
          <span>
            {t.title} <span style={{ color: "var(--muted)" }}>({t.status})</span>
          </span>
        </label>
      ))}
      <div className="row wrap" style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="btn-ghost btn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setTaskDeps(taskId, checked);
              setSavedMsg("Dependencias guardadas");
              onSaved();
            })
          }
        >
          {pending ? "…" : "Guardar dependencias"}
        </button>
        {savedMsg && (
          <span className="chip ok" style={{ fontSize: 11 }}>
            {savedMsg}
          </span>
        )}
      </div>
    </div>
  );
}
