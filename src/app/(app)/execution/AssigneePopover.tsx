"use client";

// Popover ligero de asignación (columna "Personas" del tablero Monday-style).
// Reutiliza la Server Action YA EXISTENTE setTaskAssignees (task-detail-actions.ts)
// — mismo contrato que AssigneesField.tsx del panel de detalle, sin duplicar
// lógica de servidor. Optimista: actualiza el stack de avatares al instante.

import { useState, useTransition } from "react";
import { setTaskAssignees } from "./task-detail-actions";
import { AvatarStack } from "@/components/ui";

export default function AssigneePopover({
  taskId,
  members,
  selected,
  onChange
}: {
  taskId: string;
  members: string[];
  selected: string[];
  onChange: (names: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>(selected);
  const [pending, startTransition] = useTransition();

  function toggle(name: string) {
    setChecked((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  }

  function save() {
    startTransition(async () => {
      await setTaskAssignees(taskId, checked);
      onChange(checked);
      setOpen(false);
    });
  }

  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
      <button
        type="button"
        onClick={() => {
          setChecked(selected);
          setOpen((v) => !v);
        }}
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
        aria-label="Responsables"
      >
        <AvatarStack names={selected} />
      </button>
      {open && (
        <div
          className="card"
          style={{ position: "absolute", zIndex: 45, top: 32, left: 0, width: 220, boxShadow: "var(--shadow)", padding: 12 }}
        >
          <b className="text-xs" style={{ color: "var(--muted)" }}>
            Responsables
          </b>
          <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 6 }}>
            {members.length === 0 && (
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Solo tú (proyecto personal).
              </div>
            )}
            {members.map((m) => (
              <label key={m} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", cursor: "pointer" }}>
                <input type="checkbox" checked={checked.includes(m)} onChange={() => toggle(m)} style={{ width: "auto", minHeight: "auto" }} />
                <span className="text-sm">{m}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2" style={{ marginTop: 8, display: "flex" }}>
            <button className="btn-ghost btn-sm" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button className="btn-primary btn-sm" type="button" disabled={pending} onClick={save}>
              {pending ? "…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
