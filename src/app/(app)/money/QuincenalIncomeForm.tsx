"use client";

import { useState, useTransition } from "react";
import { updateQuincenalIncome } from "./actions";

/**
 * Formulario inline para declarar/editar el ingreso quincenal. Mismo patrón
 * que ActivityWindowForm.tsx (time/) — botón que se convierte en formulario
 * al hacer clic, sin modal.
 */
export default function QuincenalIncomeForm({ income }: { income: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {income > 0 ? "Editar ingreso quincenal" : "+ Definir ingreso quincenal"}
      </button>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await updateQuincenalIncome(fd);
            setError(null);
            setOpen(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      className="flex items-center gap-2 flex-wrap mt-2"
    >
      <label className="text-xs font-bold" style={{ color: "var(--muted)" }}>
        Ingreso quincenal
      </label>
      <input name="quincenalIncome" type="number" step="0.01" min="0" defaultValue={income || ""} required style={{ width: 140 }} />
      {error && (
        <span className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
        Cancelar
      </button>
      <button type="submit" className="btn-primary btn-sm" disabled={pending}>
        {pending ? "…" : "Guardar"}
      </button>
    </form>
  );
}
