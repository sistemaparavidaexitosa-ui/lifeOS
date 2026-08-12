"use client";

import { useTransition } from "react";
import { reconcileEntry, reverseEntry } from "./actions";

export default function TxnRowActions({ entryId, status }: { entryId: string; status: string }) {
  const [pending, startTransition] = useTransition();

  if (status === "Reversed") return null;

  return (
    <div className="flex gap-1">
      {status !== "Reconciled" && (
        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => startTransition(() => reconcileEntry(entryId))}>
          Conciliar
        </button>
      )}
      <button
        className="btn-ghost btn-sm"
        disabled={pending}
        onClick={() => {
          if (confirm("¿Reversar este movimiento? Se creará una reversión contable, no se elimina.")) {
            startTransition(() => reverseEntry(entryId));
          }
        }}
      >
        Reversar
      </button>
    </div>
  );
}
