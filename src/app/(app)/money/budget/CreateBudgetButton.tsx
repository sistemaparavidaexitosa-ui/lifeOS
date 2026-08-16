"use client";

import { useState, useTransition } from "react";
import { updateQuincenalIncome, upsertBudgetLine } from "./actions";
import { defaultQuincenas, round2 } from "@/lib/domain/budget.ts";

/**
 * Botón principal "Crear presupuesto": combina en un solo paso la
 * declaración del ingreso quincenal (si aún no está definido) y el primer
 * concepto del presupuesto. Reutiliza las Server Actions ya existentes
 * (updateQuincenalIncome, upsertBudgetLine) — no crea ninguna acción ni
 * tabla paralela (ver /docs/DECISIONS.md D-003).
 *
 * Diseño (16-ago-2026, decisión explícita del owner): las categorías de
 * gasto NO se gestionan desde Configuración. El nombre del primer concepto
 * se escribe aquí mismo como texto libre; se crea automáticamente al
 * guardar (ver upsertBudgetLine en ./actions), así que este botón YA NO
 * depende de que existan categorías previas para poder mostrarse.
 *
 * Una vez que existe al menos un concepto, esta acción de "arranque" deja de
 * mostrarse; agregar más conceptos se hace con el "+ Concepto" habitual
 * (BudgetLineForm), y el ingreso quincenal se sigue pudiendo editar con
 * QuincenalIncomeForm.
 */
export default function CreateBudgetButton({
  existingCategories = [],
  hasIncome
}: {
  existingCategories?: string[];
  hasIncome: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [monthlyCost, setMonthlyCost] = useState(0);

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + Crear presupuesto
      </button>
    );
  }

  const half = round2(monthlyCost / 2);

  return (
    <div className="card" style={{ background: "var(--surface2)", marginTop: 10 }}>
      <h3 className="font-bold mb-2">Crear presupuesto</h3>
      <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
        Define tu ingreso quincenal (para calcular si tus conceptos lo exceden) y agrega tu primer concepto. Podrás
        agregar y editar el resto después.
      </p>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              const incomeValue = fd.get("quincenalIncome");
              if (incomeValue !== null && String(incomeValue).trim() !== "") {
                const incomeFd = new FormData();
                incomeFd.set("quincenalIncome", String(incomeValue));
                await updateQuincenalIncome(incomeFd);
              }
              const d = defaultQuincenas(monthlyCost);
              if (!fd.get("q1Amount")) fd.set("q1Amount", String(d.q1Amount));
              if (!fd.get("q2Amount")) fd.set("q2Amount", String(d.q2Amount));
              await upsertBudgetLine(null, fd);
              setError(null);
              setOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        {!hasIncome && (
          <div className="field">
            <label className="block text-xs font-bold mb-1">Ingreso quincenal</label>
            <input name="quincenalIncome" type="number" step="0.01" min="0" placeholder="Ej. 8000" required />
          </div>
        )}
        <div className="field">
          <label className="block text-xs font-bold mb-1">Primer concepto</label>
          <input
            name="category"
            list="create-budget-categories-list"
            placeholder="Ej. Alimentación, Renta, Gimnasio…"
            required
            autoFocus
          />
          <datalist id="create-budget-categories-list">
            {existingCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Costo mensual</label>
          <input
            name="monthlyCost"
            type="number"
            step="0.01"
            min="0.01"
            value={monthlyCost || ""}
            onChange={(e) => setMonthlyCost(Number(e.target.value))}
            required
          />
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Q1 y Q2 se dividen por defecto a la mitad ({half}); podrás editarlas de forma independiente después (A-010).
        </p>
        {error && (
          <div className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <span className="grow" />
          <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={pending}>
            {pending ? "…" : "Crear presupuesto"}
          </button>
        </div>
      </form>
    </div>
  );
}
