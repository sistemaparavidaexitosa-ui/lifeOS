"use client";

import { useState, useTransition } from "react";
import { upsertFinancialGoal, deleteFinancialGoal } from "./actions";

interface AccountLite {
  id: string;
  name: string;
}
interface FamilyMemberLite {
  id: string;
  name: string;
  relationship: string;
}
interface GoalLite {
  id: string;
  name: string;
  target: number;
  current: number;
  horizon: string | null;
  priority: string;
  accountIds: string[];
  familyMemberId: string | null;
}

export default function GoalForm({ goal, accounts, familyMembers }: { goal?: GoalLite; accounts: AccountLite[]; familyMembers: FamilyMemberLite[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {goal ? "Editar" : "+ Meta financiera"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertFinancialGoal(goal?.id ?? null, fd);
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
          <input name="target" type="number" step="0.01" placeholder="Objetivo" defaultValue={goal?.target} />
          <input name="current" type="number" step="0.01" placeholder="Acumulado manual" defaultValue={goal?.current} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="horizon" type="date" defaultValue={goal?.horizon ?? ""} />
          <select name="priority" defaultValue={goal?.priority ?? "Medium"}>
            <option value="High">Alta</option>
            <option value="Medium">Media</option>
            <option value="Low">Baja</option>
          </select>
        </div>
        <select name="familyMemberId" defaultValue={goal?.familyMemberId ?? ""}>
          <option value="">— (titular)</option>
          {familyMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.relationship}
            </option>
          ))}
        </select>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Cuentas asociadas</label>
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-xs my-1">
              <input type="checkbox" name="accountIds" value={a.id} defaultChecked={goal?.accountIds?.includes(a.id)} style={{ width: "auto", minHeight: "auto" }} />
              {a.name}
            </label>
          ))}
        </div>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {goal && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await deleteFinancialGoal(goal.id); setOpen(false); })}
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
