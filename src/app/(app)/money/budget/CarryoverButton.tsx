"use client";

import { useState, useTransition } from "react";
import { applyCarryover, removeCarryover } from "./actions";
import { money0 } from "@/lib/format";

/**
 * D-076: el arrastre entre quincenas es una DECISIÓN del usuario, no un cálculo
 * automático. Este botón es el único punto donde el sobrante (o el exceso) de la
 * quincena anterior entra al presupuesto de la actual, y siempre es reversible.
 *
 * El monto no se manda al servidor: la Server Action lo recalcula desde los
 * movimientos. Aquí sólo se muestra para que el usuario sepa qué está aceptando.
 */
export default function CarryoverButton({
  budgetId,
  periodKey,
  offered,
  applied,
  currency,
  locale
}: {
  budgetId: string;
  periodKey: string;
  /** Cierre vigente de la quincena anterior (+ sobrante / − exceso). */
  offered: number;
  /** Monto ya aplicado, congelado. `null` si el usuario no ha aplicado nada. */
  applied: number | null;
  currency: string;
  locale: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // El signo va delante y explícito: "+700" y "−300" dicen de un vistazo si lo
  // que se ofrece suma o resta, cosa que el formato de moneda solo no aclara.
  const fmt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money0(Math.abs(n), currency, locale)}`;

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });
  }

  // Ya aplicado: se muestra lo que entró y se puede quitar. Si el cierre de la
  // quincena anterior cambió después (un movimiento atrasado), se avisa en vez
  // de mover la cifra por su cuenta.
  if (applied !== null) {
    const stale = Math.abs(applied - offered) >= 0.01;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: applied >= 0 ? "var(--ok)" : "var(--danger)", fontWeight: 700 }}>{fmt(applied)}</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => removeCarryover(budgetId, periodKey))}>
            {pending ? "…" : "Quitar"}
          </button>
          {stale && (
            <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => applyCarryover(budgetId, periodKey))}>
              Actualizar a {fmt(offered)}
            </button>
          )}
        </div>
        {error && (
          <span className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </span>
        )}
      </div>
    );
  }

  // Nada que arrastrar: la quincena anterior cerró justa.
  if (Math.abs(offered) < 0.01) {
    return (
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        —
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => applyCarryover(budgetId, periodKey))}>
        {pending ? "…" : `Aplicar ${fmt(offered)}`}
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
