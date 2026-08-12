"use client";

import { useState, useTransition } from "react";
import { redeemCashback } from "./actions";

export default function RedeemButton({ cardId }: { cardId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Registrar redención
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: 110 }} />
      <button
        className="btn-primary btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await redeemCashback(cardId, amount);
            setOpen(false);
            setAmount(0);
          })
        }
      >
        {pending ? "…" : "Confirmar"}
      </button>
      <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
        ✕
      </button>
    </div>
  );
}
