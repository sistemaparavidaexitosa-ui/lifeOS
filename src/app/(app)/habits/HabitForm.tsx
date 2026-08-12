"use client";

import { useState, useTransition } from "react";
import { upsertHabit, deleteHabit } from "./actions";

interface OccupationLite {
  id: string;
  title: string;
  start: string;
  end: string;
}

export default function HabitForm({
  habit,
  occupations
}: {
  habit?: { id: string; name: string; frequency: string; category: string; occupationId: string | null };
  occupations: OccupationLite[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {habit ? "Editar" : "+ Hábito"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertHabit(habit?.id ?? null, fd);
              setOpen(false);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <input name="name" placeholder="Nombre del hábito" defaultValue={habit?.name} required />
        <div className="grid grid-cols-2 gap-2">
          <select name="frequency" defaultValue={habit?.frequency ?? "Diario"}>
            <option>Diario</option>
            <option>Semanal</option>
            <option>Entre semana</option>
            <option>Fin de semana</option>
          </select>
          <select name="category" defaultValue={habit?.category ?? "Salud"}>
            <option>Salud</option>
            <option>Aprendizaje</option>
            <option>Trabajo</option>
            <option>Personal</option>
            <option>Otros</option>
          </select>
        </div>
        <select name="occupationId" defaultValue={habit?.occupationId ?? ""}>
          <option value="">— sin ligar —</option>
          {occupations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title} ({o.start}–{o.end})
            </option>
          ))}
        </select>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Conecta el hábito con un bloque de tu Autogestión del Tiempo (FR-HAB-001).
        </p>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {habit && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await deleteHabit(habit.id); setOpen(false); })}
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
