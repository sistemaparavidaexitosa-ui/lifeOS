"use client";

import { useState, useTransition } from "react";
import { upsertDebt, deleteDebt } from "./actions";

interface DebtLite {
  id: string;
  name: string;
  balance: number;
  rate: number;
  minPayment: number;
  dueDay: number;
}

export default function DebtForm({ debt }: { debt?: DebtLite }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {debt ? "Editar" : "+ Deuda"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertDebt(debt?.id ?? null, fd);
              setOpen(false);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <input name="name" placeholder="Nombre" defaultValue={debt?.name} required />
        <div className="grid grid-cols-2 gap-2">
          <input name="balance" type="number" step="0.01" placeholder="Saldo" defaultValue={debt?.balance} />
          <input name="rate" type="number" step="0.1" placeholder="Tasa anual %" defaultValue={debt?.rate} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="minPayment" type="number" step="0.01" placeholder="Pago mínimo" defaultValue={debt?.minPayment} />
          <input name="dueDay" type="number" min={1} max={28} placeholder="Día de pago" defaultValue={debt?.dueDay ?? 1} />
        </div>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {debt && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await deleteDebt(debt.id); setOpen(false); })}
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
