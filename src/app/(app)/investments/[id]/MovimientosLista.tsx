"use client";

import { useState, useTransition } from "react";
import { money, fdate } from "@/lib/format";
import type { TipoDeMovimiento } from "@/lib/domain/money/curva-inversion.ts";
import { borrarMovimiento } from "../actions";
import { ETIQUETA_DE_TIPO } from "./MovimientoForm";

interface Fila {
  id: string;
  kind: TipoDeMovimiento;
  amount: number;
  occurred_on: string;
  note: string;
}

export default function MovimientosLista({ investmentId, movimientos, currency, locale }: { investmentId: string; movimientos: Fila[]; currency: string; locale: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {error && <div className="text-xs mb-2" style={{ color: "var(--danger)" }}>{error}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: "var(--muted)" }} className="text-left">
            <th className="pb-2">Fecha</th>
            <th>Tipo</th>
            <th>Monto</th>
            <th>Nota</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => (
            <tr key={m.id} style={{ borderTop: "1px solid var(--line)" }}>
              <td className="py-2">{fdate(m.occurred_on)}</td>
              <td>{ETIQUETA_DE_TIPO[m.kind]}</td>
              <td style={{ color: m.kind === "retiro" ? "var(--danger)" : undefined }}>
                {m.kind === "retiro" ? "−" : ""}{money(m.amount, currency, locale)}
              </td>
              <td className="text-xs" style={{ color: "var(--muted)" }}>{m.note || "—"}</td>
              <td className="text-right">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await borrarMovimiento(m.id, investmentId);
                      setError(r.ok ? null : r.reason);
                    })
                  }
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
