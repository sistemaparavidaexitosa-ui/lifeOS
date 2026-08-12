"use client";

import { useState, useTransition } from "react";
import { upsertInvestment, deleteInvestment } from "./actions";

interface FamilyMemberLite {
  id: string;
  name: string;
  relationship: string;
}
interface InvestmentLite {
  id: string;
  kind: string;
  name: string;
  institutionOrBroker: string;
  principal: number;
  rate: number;
  valuation: number;
  asOf: string;
  source: string;
  familyMemberId: string | null;
}

export default function InvestmentForm({ investment, familyMembers }: { investment?: InvestmentLite; familyMembers: FamilyMemberLite[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {investment ? "Editar" : "+ Posición"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertInvestment(investment?.id ?? null, fd);
              setOpen(false);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <div className="grid grid-cols-2 gap-2">
          <select name="kind" defaultValue={investment?.kind ?? "fija"}>
            <option value="fija">Renta fija</option>
            <option value="variable">Renta variable</option>
          </select>
          <input name="name" placeholder="Instrumento" defaultValue={investment?.name} required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="institutionOrBroker" placeholder="Institución / Broker" defaultValue={investment?.institutionOrBroker} />
          <input name="rate" type="number" step="0.1" placeholder="Tasa % (renta fija)" defaultValue={investment?.rate} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="principal" type="number" step="0.01" placeholder="Capital invertido" defaultValue={investment?.principal} />
          <input name="valuation" type="number" step="0.01" placeholder="Valor actual" defaultValue={investment?.valuation} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="asOf" type="date" defaultValue={investment?.asOf ?? new Date().toISOString().slice(0, 10)} />
          <input name="source" placeholder="Fuente" defaultValue={investment?.source ?? "Estado de cuenta"} />
        </div>
        <select name="familyMemberId" defaultValue={investment?.familyMemberId ?? ""}>
          <option value="">— (titular)</option>
          {familyMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.relationship}
            </option>
          ))}
        </select>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Asocia la posición a un dependiente económico (FR-INV-007).
        </p>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {investment && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await deleteInvestment(investment.id); setOpen(false); })}
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
