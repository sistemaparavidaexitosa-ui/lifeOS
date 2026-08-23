"use client";

import { useState, useTransition } from "react";
import { upsertPersonalGoal, deletePersonalGoal } from "./actions";

const AREAS = ["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"] as const;
const ESTADOS = ["Activa", "Pausada", "Lograda", "Abandonada"] as const;

export default function GoalForm({
  goal
}: {
  goal?: { id: string; title: string; description: string; area: string; horizon: string | null; status: string };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {goal ? "Editar" : "+ Meta"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertPersonalGoal(goal?.id ?? null, fd);
              setOpen(false);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <input name="title" placeholder="¿Qué quieres lograr?" defaultValue={goal?.title} required />
        <textarea name="description" placeholder="Por qué importa (opcional)" defaultValue={goal?.description} rows={2} />
        <div className="grid grid-cols-2 gap-2">
          <select name="area" defaultValue={goal?.area ?? "Personal"}>
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select name="status" defaultValue={goal?.status ?? "Activa"}>
            {ESTADOS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Horizonte (para calcular si vas a tiempo)
          <input name="horizon" type="date" defaultValue={goal?.horizon ?? ""} />
        </label>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {goal && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await deletePersonalGoal(goal.id);
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
