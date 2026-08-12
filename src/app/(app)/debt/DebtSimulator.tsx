"use client";

import { useMemo, useState, useTransition } from "react";
import { simulateDebt, simulateSingleDebt, type DebtMethod } from "@/lib/domain/debt.ts";
import { money0 } from "@/lib/format";
import { saveDebtScenario, acceptAiDebtPlan } from "./actions";

interface DebtLite {
  id: string;
  name: string;
  balance: number;
  rate: number;
  minPayment: number;
}

const METHOD_LABELS: Record<DebtMethod, string> = {
  avalanche: "Avalancha",
  snowball: "Bola de nieve",
  cashflow: "Cash Flow First",
  ai: "IA Optimizada"
};

const METHOD_DESCRIPTIONS: Record<DebtMethod, string> = {
  avalanche: "Prioriza la deuda de mayor tasa (menor interés total).",
  snowball: "Prioriza la de menor saldo (impulso psicológico).",
  cashflow: "Cash Flow First: liquida primero la de menor pago mínimo para liberar flujo mensual.",
  ai: "IA Optimizada: recomendación explicable; no ejecuta pagos (FR-DEB-005/FR-INT-008)."
};

export default function DebtSimulator({ debts, currency, locale }: { debts: DebtLite[]; currency: string; locale: string }) {
  const [mode, setMode] = useState<DebtMethod | "single">("avalanche");
  const [extra, setExtra] = useState(1000);
  const [singleDebtId, setSingleDebtId] = useState(debts[0]?.id ?? "");
  const [singleAmount, setSingleAmount] = useState(debts[0]?.minPayment ?? 0);
  const [pending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const base = useMemo(() => (mode !== "single" ? simulateDebt(debts, mode, 0) : null), [debts, mode]);
  const withExtra = useMemo(() => (mode !== "single" ? simulateDebt(debts, mode, extra) : null), [debts, mode, extra]);
  const singleResult = useMemo(() => {
    const d = debts.find((x) => x.id === singleDebtId);
    return d ? simulateSingleDebt(d, singleAmount) : null;
  }, [debts, singleDebtId, singleAmount]);

  return (
    <div className="card mt-3.5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Simulador de estrategia</h3>
        <span className="chip warn">No ejecuta pagos</span>
      </div>
      <div className="flex gap-1.5 rounded-2xl p-1.5 mt-2 flex-wrap" style={{ background: "var(--surface2)" }}>
        {(["avalanche", "snowball", "cashflow", "ai", "single"] as const).map((m) => (
          <button
            key={m}
            className="btn-sm rounded-xl"
            style={{ background: mode === m ? "var(--surface)" : "transparent", minHeight: 34, padding: "5px 11px" }}
            onClick={() => setMode(m)}
          >
            {m === "single" ? "Deuda específica (editable)" : METHOD_LABELS[m]}
          </button>
        ))}
      </div>

      {mode === "single" ? (
        <div className="mt-3">
          <div className="text-sm p-2.5 rounded-r-xl mb-2" style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface))", borderLeft: "3px solid var(--accent)" }}>
            FR-DEB-008: elige la deuda a liquidar, ajusta meses y monto aportado.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={singleDebtId} onChange={(e) => setSingleDebtId(e.target.value)}>
              {debts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input type="number" value={singleAmount} onChange={(e) => setSingleAmount(Number(e.target.value))} placeholder="Monto mensual aportado" />
          </div>
          {singleResult && (
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Meses estimados</span>
                <b className="block text-lg">{singleResult.months}</b>
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Interés total</span>
                <b className="block text-lg">{money0(singleResult.interest, currency, locale)}</b>
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Fecha estimada</span>
                <b className="block text-lg">
                  {new Date(Date.now() + singleResult.months * 30 * 86400000).toLocaleDateString(locale)}
                </b>
              </div>
            </div>
          )}
          <button
            className="btn-primary mt-3"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await saveDebtScenario(singleDebtId, singleAmount);
                setSavedMsg("Escenario guardado (no ejecuta pagos)");
              })
            }
          >
            Guardar escenario
          </button>
          {savedMsg && <p className="text-xs mt-1" style={{ color: "var(--ok)" }}>{savedMsg}</p>}
        </div>
      ) : (
        <div className="mt-3">
          <div className="field">
            <label className="block text-xs font-bold mb-1">Pago adicional mensual</label>
            <input type="number" value={extra} onChange={(e) => setExtra(Number(e.target.value))} />
          </div>
          {base && withExtra && (
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Meses (con extra)</span>
                <b className="block text-lg">{withExtra.months || "—"}</b>
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Meses ahorrados</span>
                <b className="block text-lg">{Math.max(0, base.months - withExtra.months)}</b>
              </div>
              <div className="stat card" style={{ padding: 15 }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Interés evitado</span>
                <b className="block text-lg">{money0(Math.max(0, base.interest - withExtra.interest), currency, locale)}</b>
              </div>
            </div>
          )}
          <div
            className="text-sm mt-3 p-2.5 rounded-r-xl"
            style={{
              background: mode === "ai" ? "color-mix(in srgb, var(--purple) 9%, var(--surface))" : "color-mix(in srgb, var(--info) 9%, var(--surface))",
              borderLeft: `3px solid ${mode === "ai" ? "var(--purple)" : "var(--info)"}`
            }}
          >
            {METHOD_DESCRIPTIONS[mode]}
          </div>
          {mode === "ai" && withExtra?.rationale && (
            <div className="text-sm mt-2 p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--purple) 9%, var(--surface))", borderLeft: "3px solid var(--purple)" }}>
              {withExtra.rationale}
            </div>
          )}
          {withExtra && withExtra.order.length > 0 && (
            <div className="text-sm mt-2 p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--info) 9%, var(--surface))", borderLeft: "3px solid var(--info)" }}>
              Orden de pago sugerido: {withExtra.order.join(" → ")} · Nueva fecha estimada:{" "}
              {withExtra.months ? new Date(Date.now() + withExtra.months * 30 * 86400000).toLocaleDateString(locale) : "—"}
            </div>
          )}
          {mode === "ai" && (
            <div className="flex gap-2 mt-2">
              <button className="btn-ghost btn-sm" onClick={() => setSavedMsg("Recomendación descartada. Queda auditada.")}>
                Descartar
              </button>
              <button
                className="btn-primary btn-sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await acceptAiDebtPlan(withExtra?.chosen ?? "avalanche", extra);
                    setSavedMsg("Plan aceptado y auditado (sin ejecutar pagos)");
                  })
                }
              >
                Aceptar plan (no mueve dinero)
              </button>
            </div>
          )}
          {savedMsg && <p className="text-xs mt-1" style={{ color: "var(--ok)" }}>{savedMsg}</p>}
        </div>
      )}

      <div className="text-xs p-2.5 rounded-r-xl mt-3" style={{ background: "var(--surface2)" }}>
        Métodos disponibles: Avalancha y Bola de nieve (FR-DEB-002); Cash Flow First e IA Optimizada (FR-DEB-005); simulador
        editable por deuda específica (FR-DEB-008). Ninguno ejecuta pagos.
      </div>
    </div>
  );
}
