"use client";
// Pill de estado (Sin empezar / Trabajando / Bloqueada / Reprogramada /
// Hecho / Cancelada). Reutiliza setTaskStatus — la MISMA Server Action que
// usan Kanban, tabla y el panel de detalle — así la máquina de estados y la
// validación de dependencias abiertas (FR-EXE-005) se respetan en todas las
// vistas. Solo ofrece las transiciones permitidas por TASK_TRANSITIONS, que
// ahora se importan directamente del dominio (una sola tabla, no una copia).
import { useState, useTransition } from "react";
import { setTaskStatus } from "./actions";
import MenuSurface, { useMenuAnchor } from "./MenuSurface";
import { STATUS_META, TASK_TRANSITIONS } from "./status-meta";
import type { TaskStatus } from "@/lib/domain/types.ts";

export default function StatusMenu({
  taskId,
  status,
  onChange,
  onError
}: {
  taskId: string;
  status: TaskStatus;
  onChange: (s: TaskStatus) => void;
  onError?: (message: string) => void;
}) {
  const menu = useMenuAnchor();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const allowed = TASK_TRANSITIONS[status];
  const meta = STATUS_META[status];

  function choose(to: TaskStatus) {
    menu.close();
    const previous = status;
    onChange(to);
    startTransition(async () => {
      try {
        await setTaskStatus(taskId, to);
        setError(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : "No se pudo cambiar el estado";
        onChange(previous);
        if (onError) onError(message);
        else setError(message);
      }
    });
  }

  return (
    <div className="mb-menu-wrap">
      <button
        type="button"
        className="mb-pill"
        style={{ background: meta.color, opacity: pending ? 0.7 : 1, cursor: allowed.length ? "pointer" : "default" }}
        onClick={(e) => allowed.length > 0 && menu.toggle(e)}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title={allowed.length ? "Cambiar estado" : "Estado final: no admite más transiciones"}
      >
        {meta.label}
      </button>
      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} label="Cambiar estado">
          <div className="ex-menu-list">
            {allowed.map((to) => (
              <button
                key={to}
                type="button"
                role="menuitem"
                onClick={() => choose(to)}
                className="mb-pill"
                style={{ background: STATUS_META[to].color }}
              >
                {STATUS_META[to].label}
              </button>
            ))}
          </div>
        </MenuSurface>
      )}
      {error && <span className="mb-inline-error text-xs">{error}</span>}
    </div>
  );
}
