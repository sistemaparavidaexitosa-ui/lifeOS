"use client";
// Columna "Prioridad" del tablero (monday.com la trae por defecto; aquí
// faltaba por completo: la prioridad solo se podía cambiar abriendo el
// detalle de la tarea, y la matriz Eisenhower dependía de ese dato).
//
// Incluye el switch de "Urgente" porque prioridad + urgencia son justamente
// los dos ejes de quadrantOf() en src/lib/domain/eisenhower.ts: cambiarlos
// aquí mueve la tarea de cuadrante sin salir del tablero.
import { useState } from "react";
import { PRIORITY_META, PRIORITY_ORDER } from "./status-meta";
import type { Priority } from "@/lib/domain/types.ts";

export default function PriorityMenu({
  priority,
  urgent,
  onChange
}: {
  priority: Priority;
  urgent: boolean;
  onChange: (priority: Priority, urgent: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = PRIORITY_META[priority];

  return (
    <div className="mb-menu-wrap">
      <button
        type="button"
        className="mb-pill soft"
        style={{ background: meta.soft, color: meta.color }}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {urgent ? "⚡ " : ""}
        {meta.label}
      </button>
      {open && (
        <>
          <div className="ex-backdrop" onClick={() => setOpen(false)} />
          <div className="mb-menu card" role="menu">
            {PRIORITY_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                role="menuitem"
                className="mb-pill soft"
                style={{ background: PRIORITY_META[p].soft, color: PRIORITY_META[p].color }}
                onClick={() => {
                  setOpen(false);
                  onChange(p, urgent);
                }}
              >
                {PRIORITY_META[p].label}
              </button>
            ))}
            <label className="mb-menu-check">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => {
                  setOpen(false);
                  onChange(priority, e.target.checked);
                }}
              />
              Urgente (Eisenhower)
            </label>
          </div>
        </>
      )}
    </div>
  );
}
