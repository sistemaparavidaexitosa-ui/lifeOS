"use client";

import { useState, useTransition } from "react";
import { clearAiHistory, clearMemory, setAiDomains } from "@/lib/insights/actions";
import { DOMAIN_LABEL, type Domain } from "@/lib/domain/insights/types.ts";

// Esta lista solo fija el ORDEN; los nombres salen de DOMAIN_LABEL, que es el
// mismo mapa que usa el motor para explicar por qué un análisis no salió.
//
// Y la unión con las claves de DOMAIN_LABEL no es adorno: al añadir el dominio
// `activity` esta lista se quedó atrás y su casilla no se pintó, así que el
// usuario NO PODÍA encenderlo mientras `setAiDomains` sí lo leía — un dominio
// condenado a estar apagado para siempre, sin que nada fallara. Ahora un
// dominio que falte aquí aparece igual, al final.
const ORDEN: Domain[] = ["money", "debt", "time", "execution", "habits", "activity"];
const DOMAINS: Domain[] = [...ORDEN, ...(Object.keys(DOMAIN_LABEL) as Domain[]).filter((d) => !ORDEN.includes(d))];

/**
 * Opt-in por dominio (§4.2) y los dos borrados del §4.4.
 *
 * Todo apagado por defecto, y la casilla es lo que autoriza que las cifras de
 * ese dominio salgan hacia el proveedor del modelo. Los borrados piden
 * confirmación porque no tienen vuelta atrás.
 */
export default function AiSettings({ enabled }: { enabled: string[] }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"history" | "memory" | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <form action={setAiDomains} className="flex flex-col gap-2">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Solo los dominios que marques envían sus hechos al modelo, y solo cuando pulses «Analizar». Lo que viaja son
          cifras ya calculadas, en texto, con los nombres de cuentas y personas sustituidos por alias.
        </p>
        {DOMAINS.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={`domain.${value}`} defaultChecked={enabled.includes(value)} />
            {DOMAIN_LABEL[value]}
          </label>
        ))}
        <div>
          <button className="btn-primary btn-sm" type="submit" disabled={pending}>
            Guardar
          </button>
        </div>
      </form>

      <div className="flex gap-2 flex-wrap items-center" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        {confirming === null && (
          <>
            <button className="btn-ghost btn-sm" onClick={() => setConfirming("history")}>
              Borrar historial de recomendaciones
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setConfirming("memory")}>
              Borrar toda la memoria
            </button>
          </>
        )}
        {confirming !== null && (
          <>
            <span className="text-sm">
              {confirming === "history"
                ? "Se borran todas las recomendaciones, incluidas las silenciadas. El motor podrá volver a proponerlas."
                : "Se borra toda la memoria. El motor dejará de saber lo que le habías dicho."}
            </span>
            <button
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  if (confirming === "history") await clearAiHistory();
                  else await clearMemory();
                  setConfirming(null);
                })
              }
            >
              Sí, borrar
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setConfirming(null)}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
