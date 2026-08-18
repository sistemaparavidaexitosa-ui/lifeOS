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

// PUNTO 1: "Registrar movimiento" es ahora un BOTÓN; el formulario ya no está
//   siempre desplegado (mismo patrón que el resto de formularios del proyecto).
// PUNTO 2: la lista de conceptos de gasto (categorías) SOLO se muestra cuando el
//   tipo es "Gasto". Al seleccionar "Ingreso" (o "Transferencia") desaparece.
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
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"expense" | "income" | "transfer">("expense");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + Registrar movimiento
      </button>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <h3 className="font-bold">Registrar movimiento</h3>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <form
        ref={ref}
        action={(fd) =>
          startTransition(async () => {
            try {
              await postTransaction(fd);
              ref.current?.reset();
              setType("expense");
              setError(null);
              setOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        <select name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
          <option value="transfer">Transferencia</option>
        </select>

        <input name="amount" type="number" min={0} step="0.01" placeholder="Monto" required />
        <input name="memo" placeholder="Concepto / descripción" required />

        <select name="accountId" required>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        {type === "transfer" && (
          <select name="accountToId" required>
            <option value="">Cuenta destino…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}

        {/* PUNTO 2: conceptos de gasto SOLO en tipo "Gasto". */}
        {type === "expense" && (
          <select name="category" defaultValue="">
            <option value="">Concepto de gasto…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

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

        {error && <div className="chip danger">{error}</div>}

        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Publicando…" : "Publicar"}
        </button>
      </form>
      <p className="text-xs" style={{ color: "var(--muted)", marginTop: 8 }}>
        Los pagos de deuda vinculados se reflejan automáticamente en el panel de Deudas (FR-DEB-006).
      </p>
    </div>
  );
}
