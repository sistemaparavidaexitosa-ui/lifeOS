"use client";

import { useRef, useState, useTransition } from "react";
import { registrarMovimiento } from "../actions";

export const ETIQUETA_DE_TIPO = {
  aportacion: "Aportación",
  retiro: "Retiro",
  rendimiento: "Rendimiento",
  valuacion: "Valuación"
} as const;

export default function MovimientoForm({ investmentId, today }: { investmentId: string; today: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      className="flex flex-col gap-2"
      action={(fd) =>
        startTransition(async () => {
          const r = await registrarMovimiento(investmentId, fd);
          if (r.ok) {
            setError(null);
            form.current?.reset();
          } else setError(r.reason);
        })
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <select name="kind" defaultValue="aportacion">
          {Object.entries(ETIQUETA_DE_TIPO).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input name="amount" type="number" step="0.01" min="0" placeholder="Monto" required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="occurredOn" type="date" defaultValue={today} max={today} required />
        <input name="note" placeholder="Nota (opcional)" maxLength={200} />
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Valuación = lo que vale la posición al cierre de ese día, con lo aportado ese día incluido.
      </p>
      {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>{pending ? "…" : "Registrar"}</button>
      </div>
    </form>
  );
}
