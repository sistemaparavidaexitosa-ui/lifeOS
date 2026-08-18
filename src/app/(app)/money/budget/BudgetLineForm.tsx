"use client";
import { useState, useTransition } from "react";
import { upsertBudgetLine, deleteBudgetLine } from "./actions";
import { defaultQuincenas, round2 } from "@/lib/domain/budget.ts";

interface BudgetLineLite {
  id: string;
  category: string;
  monthlyCost: number;
  q1Amount: number;
  q2Amount: number;
}

/**
 * PUNTO 5 (fix del error al EDITAR): en modo edición se envía la categoría como
 * campo OCULTO (`name="category"`), de modo que la Server Action siempre reciba
 * un valor válido y nunca lance por una categoría ausente. (El nombre del
 * concepto no se edita aquí; para renombrar, se borra y se crea de nuevo.)
 *
 * `existingCategories` es solo una lista de sugerencias (datalist) tomada de
 * conceptos ya creados; el usuario puede escribir cualquier nombre nuevo, que
 * se crea automáticamente al guardar (ver upsertBudgetLine en ./actions).
 */
export default function BudgetLineForm({
  line,
  existingCategories = []
}: {
  line?: BudgetLineLite;
  existingCategories?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [monthlyCost, setMonthlyCost] = useState(line?.monthlyCost ?? 0);
  const [q1, setQ1] = useState(line?.q1Amount ?? 0);
  const [q2, setQ2] = useState(line?.q2Amount ?? 0);
  const [touched, setTouched] = useState(false);

  function onMonthlyChange(v: number) {
    setMonthlyCost(v);
    if (!touched) {
      const d = defaultQuincenas(v);
      setQ1(d.q1Amount);
      setQ2(d.q2Amount);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {line ? "Editar" : "+ Concepto"}
      </button>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await upsertBudgetLine(line?.id ?? null, fd);
            setOpen(false);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      className="flex flex-col gap-2"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {line ? (
        <>
          {/* PUNTO 5: categoría oculta para no romper la Server Action al editar. */}
          <input type="hidden" name="category" value={line.category} />
          <div className="text-sm" style={{ fontWeight: 700 }}>
            {line.category}
          </div>
        </>
      ) : (
        <div>
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Concepto
          </label>
          <input name="category" list="budget-categories" placeholder="Ej. Alimentación" required />
          <datalist id="budget-categories">
            {existingCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <p className="text-xs" style={{ color: "var(--muted)", marginTop: 2 }}>
            Escribe el nombre del concepto; si es nuevo, se crea automáticamente al guardar.
          </p>
        </div>
      )}

      <div>
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Costo mensual
        </label>
        <input
          name="monthlyCost"
          type="number"
          min={0}
          step="0.01"
          value={monthlyCost}
          onChange={(e) => onMonthlyChange(Number(e.target.value))}
          required
        />
      </div>

      <div>
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Aportación Quincena 1
        </label>
        <input
          name="q1Amount"
          type="number"
          min={0}
          step="0.01"
          value={q1}
          onChange={(e) => {
            setTouched(true);
            setQ1(Number(e.target.value));
          }}
        />
      </div>

      <div>
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Aportación Quincena 2
        </label>
        <input
          name="q2Amount"
          type="number"
          min={0}
          step="0.01"
          value={q2}
          onChange={(e) => {
            setTouched(true);
            setQ2(Number(e.target.value));
          }}
        />
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Por defecto Q1 y Q2 son la mitad del costo mensual ({round2(monthlyCost / 2)}); puedes editarlas de forma independiente (A-010).
      </p>

      {error && <div className="chip danger">{error}</div>}

      <div className="flex items-center gap-2" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {line && (
          <button
            type="button"
            className="btn-danger btn-sm"
            onClick={() =>
              startTransition(async () => {
                await deleteBudgetLine(line.id);
                setOpen(false);
              })
            }
          >
            Eliminar
          </button>
        )}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
