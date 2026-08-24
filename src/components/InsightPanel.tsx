"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { analyze, setRecommendationStatus } from "@/lib/insights/actions";
import type { RecommendationStatus } from "@/lib/domain/insights/states.ts";
import type { Scope } from "@/lib/insights/context";
import { Chip } from "./ui";

export interface RecommendationLite {
  id: string;
  type: string;
  text: string;
  confidence: string;
  impact: string;
  assumptions: string[];
  evidence: string[];
}

/**
 * Panel de recomendaciones, reutilizable por ámbito. En la Fase 1 solo se
 * embebe en /money y todo lo que muestra es informativo: no hay acciones
 * aplicables todavía, solo descartar o silenciar.
 *
 * El análisis lo dispara SIEMPRE el usuario con el botón. Eso es lo que hace
 * de este clic el consentimiento: mientras no se toque, ningún dato sale del
 * servidor. El texto de abajo dice exactamente qué se envía.
 */
export default function InsightPanel({
  scope,
  recommendations
}: {
  scope: Scope;
  recommendations: RecommendationLite[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await analyze(scope);
      if (!result.ok) setMessage(result.reason ?? "No se pudo generar el análisis.");
      else if (!result.created) setMessage(result.reason ?? "Sin recomendaciones nuevas.");
      else setMessage(null);
    });
  }

  return (
    <div className="card" style={{ borderLeft: "3px solid var(--c-teal, var(--accent))" }}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold">Recomendaciones</h4>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Se calculan tus cifras aquí y solo se envían al modelo como texto ya resumido, sin nombres de cuentas ni de
            personas. Nada sale hasta que lo pidas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn-ghost btn-sm" href="/intelligence">
            Ver bandeja
          </Link>
          <button className="btn-primary btn-sm" disabled={pending} onClick={run}>
            {pending ? "Analizando…" : "Analizar"}
          </button>
        </div>
      </div>

      {message && (
        <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          {message}
        </div>
      )}

      {!recommendations.length && !message && (
        <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          Todavía no hay recomendaciones. Pulsa Analizar cuando quieras una lectura de tus cifras del ciclo.
        </p>
      )}

      {recommendations.map((r) => (
        <div key={r.id} className="rounded-xl p-2.5 mt-2" style={{ background: "var(--surface2)" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <Chip kind={r.impact === "Alto" ? "bad" : r.impact === "Medio" ? "warn" : ""}>{r.impact}</Chip>
            <Chip kind="info">confianza {r.confidence.toLowerCase()}</Chip>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {r.type}
            </span>
          </div>
          <p className="text-sm mt-1.5">{r.text}</p>
          {r.assumptions.length > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Supuestos: {r.assumptions.join(" · ")}
            </p>
          )}
          {r.evidence.length > 0 && (
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Basada en: {r.evidence.join(", ")}
            </p>
          )}
          <div className="flex gap-2 mt-2 flex-wrap">
            {(
              [
                ["Accepted", "De acuerdo"],
                ["Dismissed", "Descartar"],
                ["Suppressed", "No mostrar de nuevo"],
                ["Reported", "Está mal"]
              ] as [RecommendationStatus, string][]
            ).map(([status, label]) => (
              <button
                key={status}
                className="btn-ghost btn-sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await setRecommendationStatus(r.id, status);
                    if (!res.ok) setMessage(res.reason ?? "No se pudo actualizar.");
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
