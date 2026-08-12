"use client";

import { useState, useTransition } from "react";
import { upsertCashbackCard, deleteCashbackCard } from "./actions";

interface DebtLite {
  id: string;
  name: string;
}
interface CardLite {
  id: string;
  name: string;
  ratePct: number;
  debtId: string | null;
  accruedEstimate: number;
  eligibleCategories: string[];
}

export default function CashbackForm({ card, debts, categories }: { card?: CardLite; debts: DebtLite[]; categories: string[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {card ? "Editar" : "+ Tarjeta"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertCashbackCard(card?.id ?? null, fd);
              setOpen(false);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <input name="name" placeholder="Nombre" defaultValue={card?.name} required />
        <div className="grid grid-cols-2 gap-2">
          <input name="ratePct" type="number" step="0.1" placeholder="Tasa de cashback (%)" defaultValue={card?.ratePct ?? 1} />
          <input name="accruedEstimate" type="number" step="0.01" placeholder="Cashback acumulado estimado" defaultValue={card?.accruedEstimate ?? 0} />
        </div>
        <select name="debtId" defaultValue={card?.debtId ?? ""}>
          <option value="">— sin vincular —</option>
          {debts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Categorías elegibles</label>
          <div className="flex flex-col gap-1">
            {categories.map((c) => (
              <label key={c} className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="eligibleCategories" value={c} defaultChecked={card?.eligibleCategories?.includes(c)} style={{ width: "auto", minHeight: "auto" }} />
                {c}
              </label>
            ))}
          </div>
        </div>
        <div className="text-xs p-2 rounded-lg" style={{ background: "color-mix(in srgb, var(--warn) 12%, transparent)", color: "var(--warn)" }}>
          El cashback es un estimado informativo (NG-012).
        </div>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {card && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await deleteCashbackCard(card.id); setOpen(false); })}
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
