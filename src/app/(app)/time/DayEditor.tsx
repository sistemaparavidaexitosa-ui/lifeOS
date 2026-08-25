"use client";

// Autogestión del Tiempo — soporte multi-día: Editor de un día específico,
// embebido en la vista semanal (WeekView.tsx). Cierra los requisitos:
//   - "la vista semanal... se podrá editar cada día desde la vista semanal"
//   - "agregar ocupaciones... agrega también tareas, editar sus
//     ocupaciones y tareas de cualquier día de la semana"
//
// Todo lo que aquí se edita persiste vía las MISMAS Server Actions ya
// usadas en la vista del día (time/actions.ts) — sin duplicar lógica de
// dominio ni crear un esquema paralelo. availableSlots (cálculo de huecos)
// es la misma función pura de src/lib/domain/time.ts usada en la vista del
// día — ninguna lógica de negocio se reescribe aquí.

import { useState, useTransition } from "react";
import { availableSlots, daysLabel } from "@/lib/domain/time.ts";
import OccupationForm from "./OccupationForm";
import AssignSlotButton from "./AssignSlotButton";
import { assignTaskToDate, unassignTaskDue } from "./actions";

interface OccupationLite {
  id: string;
  title: string;
  start: string;
  end: string;
  category: string;
  recurring: boolean;
  date: string | null;
  days: number[]; // 0=domingo … 6=sábado; solo aplica si recurring
}

interface TaskLite {
  id: string;
  title: string;
  est: number;
}

interface DueTaskLite {
  id: string;
  title: string;
  est: number;
  status: string;
}

export default function DayEditor({
  dayISO,
  dayLabel,
  windowStart,
  windowEnd,
  occupations,
  pendingTasks,
  dueTasks
}: {
  dayISO: string;
  dayLabel: string;
  windowStart: string;
  windowEnd: string;
  occupations: OccupationLite[];
  pendingTasks: TaskLite[];
  dueTasks: DueTaskLite[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [rescheduleDate, setRescheduleDate] = useState<Record<string, string>>({});

  const slots = availableSlots({ start: windowStart, end: windowEnd }, occupations);

  return (
    <div style={{ marginTop: 6 }}>
      <button className="btn-ghost btn-sm" onClick={() => setOpen(!open)} style={{ width: "100%" }}>
        {open ? `Cerrar edición de ${dayLabel}` : `Editar ${dayLabel}`}
      </button>

      {open && (
        <div className="card" style={{ background: "var(--surface)", marginTop: 6, padding: 12 }}>
          <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between" }}>
            <b className="text-sm">Ocupaciones de {dayLabel}</b>
            <OccupationForm defaultDate={dayISO} />
          </div>
          <div style={{ marginTop: 6 }}>
            {!occupations.length && (
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Sin ocupaciones este día.
              </div>
            )}
            {occupations.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between"
                style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)" }}
              >
                <div>
                  <b className="text-sm">{o.title}</b>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {o.start} – {o.end} · {o.category}
                    {o.recurring ? ` · 🔁 ${daysLabel(o.days)}` : ""}
                  </div>
                </div>
                <OccupationForm occupation={o} defaultDate={dayISO} />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <b className="text-sm">Espacios disponibles</b>
            {!slots.length && (
              <div className="text-xs" style={{ color: "var(--muted)", marginTop: 4 }}>
                Sin espacios libres en el rango de actividad este día.
              </div>
            )}
            {slots.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between"
                style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)" }}
              >
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {s.start} – {s.end} ({Math.round((s.minutes / 60) * 10) / 10} h)
                </span>
                <AssignSlotButton slotLabel={`${s.start}–${s.end}`} tasks={pendingTasks} date={dayISO} />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <b className="text-sm">Tareas asignadas a {dayLabel}</b>
            {!dueTasks.length && (
              <div className="text-xs" style={{ color: "var(--muted)", marginTop: 4 }}>
                Ninguna tarea tiene vencimiento este día.
              </div>
            )}
            {dueTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between"
                style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "6px 0", borderTop: "1px solid var(--line)" }}
              >
                <span className="text-sm">
                  {t.title}{" "}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    ({t.status})
                  </span>
                </span>
                <div className="row" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="date"
                    value={rescheduleDate[t.id] ?? dayISO}
                    onChange={(e) => setRescheduleDate((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    style={{ fontSize: 12 }}
                  />
                  <button
                    className="btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await assignTaskToDate(t.id, rescheduleDate[t.id] ?? dayISO);
                      })
                    }
                  >
                    Reprogramar
                  </button>
                  <button className="btn-ghost btn-sm" disabled={pending} onClick={() => startTransition(async () => unassignTaskDue(t.id))}>
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
