"use client";
// Chip de rango de fechas (columna "Fechas"). Persiste start_date/due con
// updateTaskDates y aplica el cambio de forma optimista.
//
// Novedad: `overdue` pinta el chip en rojo cuando la tarea está vencida
// (regla única isOverdue() de src/lib/domain/board.ts), y un atajo "Hoy" /
// "+1 semana" evita tener que abrir el datepicker para las dos operaciones
// más frecuentes.
import { useState, useTransition } from "react";
import { IconCalendar } from "@/components/icons";
import { addDaysISO } from "@/lib/domain/board.ts";
import { updateTaskDates } from "./actions";
import MenuSurface, { useMenuAnchor } from "./MenuSurface";

function fmt(d: string | null): string | null {
  if (!d) return null;
  return new Date(`${d}T00:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

export default function TimelineEditor({
  taskId,
  start,
  due,
  overdue = false,
  today,
  onChange
}: {
  taskId: string;
  start: string | null;
  due: string | null;
  overdue?: boolean;
  /** "Hoy" del perfil: los atajos de fecha deben usar el día del usuario. */
  today: string;
  onChange: (start: string | null, due: string | null) => void;
}) {
  const menu = useMenuAnchor();
  const [s, setS] = useState(start ?? "");
  const [d, setD] = useState(due ?? "");
  const [pending, startTransition] = useTransition();

  const label = start && due ? `${fmt(start)} - ${fmt(due)}` : due ? fmt(due)! : start ? `Desde ${fmt(start)}` : "Sin fecha";

  function persist(nextStart: string | null, nextDue: string | null) {
    setS(nextStart ?? "");
    setD(nextDue ?? "");
    onChange(nextStart, nextDue);
    startTransition(async () => {
      await updateTaskDates(taskId, nextStart, nextDue);
      menu.close();
    });
  }

  return (
    <div className="mb-menu-wrap">
      <button
        type="button"
        className={`mb-timeline${overdue ? " overdue" : ""}`}
        onClick={menu.toggle}
        aria-expanded={menu.open}
        title={overdue ? "Tarea vencida" : "Editar fechas"}
      >
        <IconCalendar width={14} height={14} />
        {label}
      </button>
      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} align="end" width={244} className="mb-dates" label="Editar fechas">
            <label className="text-xs">Inicio</label>
            <input type="date" value={s} onChange={(e) => setS(e.target.value)} />
            <label className="text-xs">Fin / vence</label>
            <input type="date" value={d} onChange={(e) => setD(e.target.value)} />
            <div className="mb-dates-quick">
              <button type="button" className="btn-ghost btn-sm" onClick={() => persist(s || null, today)}>
                Vence hoy
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => persist(s || null, addDaysISO(today, 7))}>
                +1 semana
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => persist(null, null)}>
                Sin fecha
              </button>
            </div>
            <div className="mb-dates-actions">
              <button type="button" className="btn-ghost btn-sm" onClick={menu.close}>
                Cancelar
              </button>
              <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => persist(s || null, d || null)}>
                {pending ? "…" : "Guardar"}
              </button>
            </div>
        </MenuSurface>
      )}
    </div>
  );
}
