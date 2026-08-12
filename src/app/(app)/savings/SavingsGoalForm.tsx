"use client";

import { useState, useTransition } from "react";
import { upsertSavingsGoal, deleteSavingsGoal, contributeToSaving } from "./actions";

interface GoalLite {
  id: string;
  name: string;
  type: string;
  target: number;
  current: number;
  monthly: number;
  targetDate: string | null;
  priority: string;
}

export function SavingsGoalForm({ goal }: { goal?: GoalLite }) {
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
              await upsertSavingsGoal(goal?.id ?? null, fd);
              setOpen(false);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <input name="name" placeholder="Nombre" defaultValue={goal?.name} required />
        <div className="grid grid-cols-2 gap-2">
          <select name="type" defaultValue={goal?.type ?? "Emergencia"}>
            <option>Emergencia</option>
            <option>Viajes</option>
            <option>Casa</option>
            <option>Empresa</option>
            <option>Automóvil</option>
            <option>Impuestos</option>
            <option>Jubilación</option>
          </select>
          <select name="priority" defaultValue={goal?.priority ?? "Medium"}>
            <option value="High">Alta</option>
            <option value="Medium">Media</option>
            <option value="Low">Baja</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="target" type="number" step="0.01" placeholder="Objetivo" defaultValue={goal?.target} />
          <input name="current" type="number" step="0.01" placeholder="Acumulado" defaultValue={goal?.current} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="monthly" type="number" step="0.01" placeholder="Aportación mensual" defaultValue={goal?.monthly} />
          <input name="targetDate" type="date" defaultValue={goal?.targetDate ?? ""} />
        </div>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {goal && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await deleteSavingsGoal(goal.id); setOpen(false); })}
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

export function ContributeButton({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        + Aportar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: 110 }} />
      <button
        className="btn-primary btn-sm"
        disabled={pending}
        onClick={() => startTransition(async () => { await contributeToSaving(goalId, amount); setOpen(false); setAmount(0); })}
      >
        {pending ? "…" : "Aportar"}
      </button>
      <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
        ✕
      </button>
    </div>
  );
}
