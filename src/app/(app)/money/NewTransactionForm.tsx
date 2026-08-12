"use client";

import { useRef, useState, useTransition } from "react";
import { postTransaction } from "./actions";

interface AccountLite {
  id: string;
  name: string;
}
interface DebtLite {
  id: string;
  name: string;
}
interface FamilyMemberLite {
  id: string;
  name: string;
  relationship: string;
}

export default function NewTransactionForm({
  accounts,
  categories,
  debts,
  familyMembers
}: {
  accounts: AccountLite[];
  categories: string[];
  debts: DebtLite[];
  familyMembers: FamilyMemberLite[];
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<"expense" | "income" | "transfer">("expense");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card">
      <h3 className="font-bold mb-2">Registrar movimiento</h3>
      <form
        ref={ref}
        action={(fd) =>
          startTransition(async () => {
            try {
              await postTransaction(fd);
              ref.current?.reset();
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <select name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
          <option value="transfer">Transferencia</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input name="amount" type="number" step="0.01" placeholder="Monto" required />
          <input name="effectiveAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>
        <select name="accountId">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {type === "transfer" && (
          <select name="accountToId">
            <option value="">Cuenta destino</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        {type !== "transfer" && (
          <select name="category" defaultValue="Otros">
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        <input name="memo" placeholder="Concepto" required />
        <select name="familyMemberId" defaultValue="">
          <option value="">— (titular / general del hogar)</option>
          {familyMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.relationship}
            </option>
          ))}
        </select>
        {type === "expense" && (
          <select name="debtId" defaultValue="">
            <option value="">— (no es pago de deuda)</option>
            {debts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <button className="btn-primary" disabled={pending} type="submit">
          {pending ? "Publicando…" : "Publicar"}
        </button>
      </form>
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        Los pagos de deuda vinculados se reflejan automáticamente en el panel de Deudas (FR-DEB-006).
      </p>
    </div>
  );
}
