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

export default function BudgetLineForm({ line, categories }: { line?: BudgetLineLite; categories: string[] }) {
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
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {line ? "Editar" : "+ Concepto"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
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
      >
        {line ? (
          <input name="category" value={line.category} disabled />
        ) : (
          <select name="category" defaultValue={categories[0]}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        <div className="field">
          <label className="block text-xs font-bold mb-1">Costo mensual</label>
          <input name="monthlyCost" type="number" step="0.01" value={monthlyCost} onChange={(e) => onMonthlyChange(Number(e.target.value))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="field">
            <label className="block text-xs font-bold mb-1">Aportación Quincena 1</label>
            <input
              name="q1Amount"
              type="number"
              step="0.01"
              value={q1}
              onChange={(e) => {
                setTouched(true);
                setQ1(Number(e.target.value));
              }}
            />
          </div>
          <div className="field">
            <label className="block text-xs font-bold mb-1">Aportación Quincena 2</label>
            <input
              name="q2Amount"
              type="number"
              step="0.01"
              value={q2}
              onChange={(e) => {
                setTouched(true);
                setQ2(Number(e.target.value));
              }}
            />
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Por defecto Q1 y Q2 son la mitad del costo mensual ({round2(monthlyCost / 2)}); puedes editarlas de forma independiente
          (A-010).
        </p>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {line && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await deleteBudgetLine(line.id); setOpen(false); })}
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
