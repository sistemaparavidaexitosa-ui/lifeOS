"use client";

// Chip de rango de fechas (columna "Timeline" estilo monday.com). Usa
// updateTaskDates (nueva Server Action en actions.ts) para persistir
// start_date/due. Optimista: refleja el nuevo rango de inmediato.

import { useState, useTransition } from "react";
import { IconCalendar } from "@/components/icons";
import { updateTaskDates } from "./actions";

function fmt(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

export default function TimelineEditor({
  taskId,
  start,
  due,
  onChange
}: {
  taskId: string;
  start: string | null;
  due: string | null;
  onChange: (start: string | null, due: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(start ?? "");
  const [d, setD] = useState(due ?? "");
  const [pending, startTransition] = useTransition();

  const label = start && due ? `${fmt(start)} - ${fmt(due)}` : due ? fmt(due)! : "Sin fecha";

  function save() {
    startTransition(async () => {
      await updateTaskDates(taskId, s || null, d || null);
      onChange(s || null, d || null);
      setOpen(false);
    });
  }

  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
      <button type="button" className="mb-timeline" onClick={() => setOpen((v) => !v)}>
        <IconCalendar width={14} height={14} />
        {label}
      </button>
      {open && (
        <div className="card" style={{ position: "absolute", zIndex: 45, top: 36, right: 0, width: 230, boxShadow: "var(--shadow)", padding: 12 }}>
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Inicio
          </label>
          <input type="date" value={s} onChange={(e) => setS(e.target.value)} />
          <label className="text-xs" style={{ color: "var(--muted)", marginTop: 6, display: "block" }}>
            Fin / vence
          </label>
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} />
          <div className="flex gap-2" style={{ marginTop: 8, display: "flex" }}>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={save}>
              {pending ? "…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
