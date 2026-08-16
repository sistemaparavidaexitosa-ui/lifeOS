"use client";

import { useState, useTransition } from "react";
import { upsertOccupation, deleteOccupation } from "./actions";

interface OccupationLite {
  id: string;
  title: string;
  start: string;
  end: string;
  category: string;
  recurring: boolean;
  date: string | null;
}

/**
 * FR-TIM-001/008: ahora soporta ocupaciones para CUALQUIER día de la
 * semana. `defaultDate` es el día para el que se está creando/editando la
 * ocupación (pasado por el llamador: "hoy" desde la vista del día, o el día
 * específico de la columna desde la vista semanal, vía DayEditor.tsx). Si
 * "recurring" está marcado, el campo de fecha se deshabilita (la ocupación
 * se repite todos los días y occ_date se guarda como null).
 */
export default function OccupationForm({ occupation, defaultDate }: { occupation?: OccupationLite; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [recurring, setRecurring] = useState(occupation?.recurring ?? false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {occupation ? "Editar" : "+ Ocupación"}
      </button>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await upsertOccupation(occupation?.id ?? null, fd);
            setOpen(false);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      className="flex flex-col gap-2"
    >
      <input name="title" placeholder="Título" defaultValue={occupation?.title} required />
      <div className="grid grid-cols-2 gap-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input name="start" type="time" defaultValue={occupation?.start} required />
        <input name="end" type="time" defaultValue={occupation?.end} required />
      </div>
      <select name="category" defaultValue={occupation?.category ?? "Trabajo"}>
        <option value="Trabajo">Trabajo</option>
        <option value="Familia">Familia</option>
        <option value="Personal">Personal</option>
        <option value="Salud">Salud</option>
        <option value="Descanso">Descanso</option>
        <option value="Otros">Otros</option>
      </select>
      <label className="row sm" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="checkbox"
          name="recurring"
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
          style={{ width: "auto" }}
        />
        Se repite todos los días
      </label>
      <div>
        <label className="text-xs" style={{ color: "var(--muted)", display: "block", marginBottom: 4 }}>
          Día {recurring ? "(ignorado: se repite todos los días)" : ""}
        </label>
        <input name="date" type="date" defaultValue={occupation?.date ?? defaultDate} disabled={recurring} required={!recurring} />
      </div>
      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
      <div className="row" style={{ display: "flex", gap: 8 }}>
        {occupation && (
          <button
            type="button"
            className="btn-danger btn-sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteOccupation(occupation.id);
                setOpen(false);
              })
            }
          >
            Eliminar
          </button>
        )}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancelar
        </button>
        <button className="btn-primary btn-sm" disabled={pending}>
          {pending ? "…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
