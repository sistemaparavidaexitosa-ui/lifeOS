"use client";

import { useState, useTransition } from "react";
import { editRecommendationText, setRecommendationStatus } from "@/lib/insights/actions";
import { nextStatuses, STATUS_LABEL, type RecommendationStatus } from "@/lib/domain/insights/states.ts";

/**
 * Una tarjeta de la bandeja. Los botones que se ofrecen NO son una lista fija:
 * salen de la máquina de estados (§5.1), así que la UI no puede proponer una
 * transición que el servidor vaya a rechazar.
 */
export default function RecommendationRow({
  id,
  text,
  status,
  assumptions,
  evidence
}: {
  id: string;
  text: string;
  status: RecommendationStatus;
  assumptions: string[];
  evidence: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  const opciones = nextStatuses(status);

  return (
    <div className="mt-1.5">
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
          <div className="flex gap-2">
            <button
              className="btn-primary btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await editRecommendationText(id, draft);
                  if (res.ok) setEditing(false);
                  else setError(res.reason ?? "No se pudo guardar.");
                })
              }
            >
              Guardar
            </button>
            <button className="btn-ghost btn-sm" onClick={() => { setDraft(text); setEditing(false); }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm">{text}</p>
      )}

      {assumptions.length > 0 && (
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Supuestos: {assumptions.join(" · ")}
        </p>
      )}
      {evidence.length > 0 && (
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          Basada en: {evidence.join(", ")}
        </p>
      )}

      {!editing && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {opciones.includes("Edited") && (
            <button className="btn-ghost btn-sm" disabled={pending} onClick={() => setEditing(true)}>
              Editar
            </button>
          )}
          {opciones
            .filter((s) => s !== "Edited")
            .map((s) => (
              <button
                key={s}
                className="btn-ghost btn-sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await setRecommendationStatus(id, s);
                    if (!res.ok) setError(res.reason ?? "No se pudo actualizar.");
                    else setError(null);
                  })
                }
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          {!opciones.length && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Sin más acciones: este estado es final.
            </span>
          )}
        </div>
      )}

      {error && <div className="text-xs mt-1" style={{ color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}
