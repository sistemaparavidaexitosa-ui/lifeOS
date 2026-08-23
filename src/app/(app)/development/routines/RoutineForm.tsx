"use client";

import { useState, useTransition } from "react";
import { upsertRoutine, deleteRoutine, upsertRoutineStep, deleteRoutineStep } from "./actions";

export interface OccupationLite {
  id: string;
  title: string;
  start: string;
  end: string;
}

export interface HabitLite {
  id: string;
  name: string;
}

const FRECUENCIAS = ["Diario", "Semanal", "Entre semana", "Fin de semana"] as const;

export default function RoutineForm({
  routine,
  occupations
}: {
  routine?: { id: string; name: string; frequency: string; occupationId: string | null; active: boolean };
  occupations: OccupationLite[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {routine ? "Editar" : "+ Rutina"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertRoutine(routine?.id ?? null, fd);
              setOpen(false);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <input name="name" placeholder="Nombre de la rutina" defaultValue={routine?.name} required />
        <select name="frequency" defaultValue={routine?.frequency ?? "Diario"}>
          {FRECUENCIAS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <select name="occupationId" defaultValue={routine?.occupationId ?? ""}>
          <option value="">— sin anclar a un bloque —</option>
          {occupations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title} ({o.start}–{o.end})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <input type="checkbox" name="active" defaultChecked={routine?.active ?? true} />
          Activa
        </label>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          El horario vive en Autogestión del Tiempo: la rutina solo se ancla a un bloque que ya existe (BR-026).
        </p>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {routine && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await deleteRoutine(routine.id);
                    setOpen(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
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

export function StepForm({
  routineId,
  step,
  position,
  habits
}: {
  routineId: string;
  step?: { id: string; title: string; durationMin: number; habitId: string | null; position: number };
  position: number;
  habits: HabitLite[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {step ? "Editar paso" : "+ Paso"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertRoutineStep(routineId, step?.id ?? null, fd);
              setOpen(false);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <input name="title" placeholder="Paso (ej. Meditar 10 min)" defaultValue={step?.title} required />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Minutos
            <input name="durationMin" type="number" min={1} defaultValue={step?.durationMin ?? 5} required />
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Orden
            <input name="position" type="number" min={0} defaultValue={step?.position ?? position} />
          </label>
        </div>
        <select name="habitId" defaultValue={step?.habitId ?? ""}>
          <option value="">— sin ligar —</option>
          {habits.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Si ligas el paso a un hábito, completarlo aquí marca ese hábito de hoy: la racha no se bifurca.
        </p>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {step && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await deleteRoutineStep(step.id);
                    setOpen(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
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
