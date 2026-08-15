"use client";

// FASE 1 — Responsables (assignees) de una tarea. FR-COL-003, BR-015: solo
// se listan miembros con acceso al proyecto (calculados por getTaskDetail en
// task-detail-actions.ts). Si el proyecto es personal, solo aparece el
// propio titular.

import { useState, useTransition } from "react";
import { setTaskAssignees } from "./task-detail-actions";

export default function AssigneesField({
  taskId,
  members,
  selected,
  onSaved
}: {
  taskId: string;
  members: string[];
  selected: string[];
  onSaved: () => void;
}) {
  const [checked, setChecked] = useState<string[]>(selected);
  const [pending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  function toggleMember(name: string) {
    setChecked((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
    setSavedMsg(null);
  }

  return (
    <div className="card" style={{ background: "var(--surface)", marginTop: 8 }}>
      <b className="text-sm">Responsables</b>
      {members.length === 0 && (
        <div className="text-xs" style={{ color: "var(--muted)", marginTop: 6 }}>
          Proyecto personal: solo tú.
        </div>
      )}
      {members.map((m) => (
        <label key={m} className="row sm" style={{ margin: "4px 0", display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={checked.includes(m)} onChange={() => toggleMember(m)} style={{ width: "auto" }} />
          <span>{m}</span>
        </label>
      ))}
      <div className="row wrap" style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="btn-ghost btn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setTaskAssignees(taskId, checked);
              setSavedMsg("Responsables guardados");
              onSaved();
            })
          }
        >
          {pending ? "…" : "Guardar responsables"}
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
