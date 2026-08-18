"use client";
import { useRef, useState, useTransition } from "react";
import { createAccount } from "./actions";

// PUNTO 3 (segunda parte): "Nueva cuenta" es ahora un BOTÓN; el formulario ya
// no está siempre desplegado (mismo patrón que el resto de formularios).
export default function NewAccountForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        + Nueva cuenta
      </button>
    );
  }

  return (
    <form
      ref={ref}
      action={(fd) =>
        startTransition(async () => {
          await createAccount(fd);
          ref.current?.reset();
          setOpen(false);
        })
      }
      className="flex flex-col gap-2"
      style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}
    >
      <input name="name" placeholder="Nombre de la cuenta" required />
      <div className="grid grid-cols-2 gap-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <select name="type" defaultValue="bank">
          <option value="bank">Banco</option>
          <option value="cash">Efectivo</option>
          <option value="savings">Ahorro</option>
          <option value="credit">Crédito</option>
          <option value="investment">Inversión</option>
        </select>
        <select name="currency" defaultValue="MXN">
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
      </div>
      <input name="opening" type="number" step="0.01" defaultValue={0} placeholder="Saldo inicial" />
      <div className="flex items-center gap-2" style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending} style={{ flex: 1 }}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={pending} style={{ flex: 1 }}>
          {pending ? "…" : "+ Cuenta"}
        </button>
      </div>
    </form>
  );
}
