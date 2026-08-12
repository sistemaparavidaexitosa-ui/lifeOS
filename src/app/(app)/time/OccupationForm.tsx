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
}

export default function OccupationForm({ occupation }: { occupation?: OccupationLite }) {
  const [open, setOpen] = useState(false);
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
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
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
        <div className="grid grid-cols-2 gap-2">
          <input name="start" type="time" defaultValue={occupation?.start ?? "09:00"} required />
          <input name="end" type="time" defaultValue={occupation?.end ?? "10:00"} required />
        </div>
        <select name="category" defaultValue={occupation?.category ?? "Trabajo"}>
          <option>Trabajo</option>
          <option>Familia</option>
          <option>Personal</option>
          <option>Salud</option>
          <option>Descanso</option>
          <option>Otros</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="recurring" defaultChecked={occupation?.recurring} style={{ width: "auto", minHeight: "auto" }} />
          Se repite todos los días
        </label>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
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
          <span className="grow" />
          <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={pending}>
            {pending ? "…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
