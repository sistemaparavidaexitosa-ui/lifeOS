"use client";

// Popover ligero de asignación (columna "Personas" del tablero Monday-style).
// Reutiliza la Server Action YA EXISTENTE setTaskAssignees (task-detail-actions.ts)
// — mismo contrato que AssigneesField.tsx del panel de detalle, sin duplicar
// lógica de servidor. Optimista: actualiza el stack de avatares al instante.

import { useState, useTransition } from "react";
import { setTaskAssignees } from "./task-detail-actions";
import { AvatarStack } from "@/components/ui";
import MenuSurface, { useMenuAnchor } from "./MenuSurface";

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
  const menu = useMenuAnchor();
  const [checked, setChecked] = useState<string[]>(selected);
  const [pending, startTransition] = useTransition();

  function toggle(name: string) {
    setChecked((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  }

  function save() {
    startTransition(async () => {
      await setTaskAssignees(taskId, checked);
      onChange(checked);
      menu.close();
    });
  }

  return (
    <div className="mb-menu-wrap">
      <button
        type="button"
        className="mb-people-btn"
        onClick={(e) => {
          setChecked(selected);
          menu.toggle(e);
        }}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label="Responsables"
      >
        <AvatarStack names={selected} />
      </button>
      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} width={232} label="Responsables">
          <b className="ex-menu-title">Responsables</b>
          <div className="ex-menu-scroll">
            {members.length === 0 && <div className="ex-menu-empty">Solo tú (proyecto personal).</div>}
            {members.map((m) => (
              <label key={m} className="ex-menu-check">
                <input type="checkbox" checked={checked.includes(m)} onChange={() => toggle(m)} />
                <span>{m}</span>
              </label>
            ))}
          </div>
          <div className="ex-menu-actions">
            <button className="btn-ghost btn-sm" type="button" onClick={menu.close}>
              Cancelar
            </button>
            <button className="btn-primary btn-sm" type="button" disabled={pending} onClick={save}>
              {pending ? "…" : "Guardar"}
            </button>
          </div>
        </MenuSurface>
      )}
    </div>
  );
}
