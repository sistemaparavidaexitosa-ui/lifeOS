"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { reactToBriefItem, regenerateTodayBrief } from "@/lib/identity/brief-actions";
import type { BriefView, Reaccion } from "@/lib/identity/brief-view";
import VisualizationPlayer from "./VisualizationPlayer";
import AffirmationGroups from "./AffirmationGroups";
import MantraCard from "./MantraCard";
import DailyActionCard from "./DailyActionCard";

/**
 * Nombrar al autor AQUÍ es correcto y distinto de atribuirle la frase: el pie
 * dice en qué principios se inspiró un texto original, no quién lo escribió.
 * Lo que tiene prohibido es aparecer dentro de `quote.text`, y de eso se
 * encarga `citaAtribuida`.
 */
const PRINCIPIO: Record<string, string> = {
  hill: "Napoleon Hill",
  goddard: "Neville Goddard",
  clear: "James Clear",
  sharma: "Robin Sharma",
  dispenza: "Joe Dispenza"
};

/**
 * El brief de identidad del día, entero: afirmaciones con «me resuena / no»,
 * recordatorio, visualización guiada, pregunta y cita.
 *
 * Guarda el brief en estado propio y lo reemplaza con lo que devuelven las
 * acciones: regenerar o reaccionar se ve al instante sin esperar a que la
 * página se vuelva a pedir.
 */
export default function BriefCard({ initial, traitNames }: { initial: BriefView; traitNames: Record<string, string> }) {
  const [brief, setBrief] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reaccionar(itemId: string, reaction: Reaccion) {
    const siguiente = brief.reactions[itemId] === reaction ? null : reaction;
    // Optimista: la reacción es barata y se deshace sola si falla.
    const antes = brief.reactions;
    const nuevas = { ...antes };
    if (siguiente) nuevas[itemId] = siguiente;
    else delete nuevas[itemId];
    setBrief({ ...brief, reactions: nuevas });
    startTransition(async () => {
      const r = await reactToBriefItem({ briefId: brief.id, itemId, reaction: siguiente });
      if (!r.ok) {
        setBrief((b) => ({ ...b, reactions: antes }));
        setError(r.reason ?? "No se pudo guardar tu reacción.");
      }
    });
  }

  function regenerar() {
    startTransition(async () => {
      const r = await regenerateTodayBrief();
      if (!r.ok || !r.brief) return setError(r.reason ?? "No se pudo generar otro brief.");
      setError(null);
      setBrief(r.brief);
    });
  }

  return (
    <div className="flex flex-col gap-3.5" style={{ opacity: pending ? 0.7 : 1, transition: "opacity .2s" }}>
      <MantraCard mantra={brief.mantra} focusArea={brief.focusArea} />

      <Card>
        <div className="flex items-start gap-2">
          <div className="grow min-w-0 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Tu identidad hoy
            </span>
            <p className="text-base font-semibold leading-snug">{brief.identityReminder}</p>
          </div>
          {brief.generation < 3 && (
            <button type="button" className="btn-ghost btn-sm flex-shrink-0" onClick={regenerar} disabled={pending} title="Genera otro brief para hoy (hasta 3)">
              {pending ? "…" : "Otro"}
            </button>
          )}
        </div>

        <AffirmationGroups brief={brief} traitNames={traitNames} onReact={reaccionar} />
        {error && (
          <p className="text-xs mt-3" role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
      </Card>

      <DailyActionCard brief={brief} traitNames={traitNames} />

      <div className="grid gap-3.5 md:grid-cols-2 items-start">
        <Card>
          <div className="flex flex-col gap-1 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Visualización · {brief.visualization.durationMin} min
            </span>
            <b className="text-sm">{brief.visualization.title}</b>
          </div>
          <VisualizationPlayer visualization={brief.visualization} />
        </Card>

        <div className="flex flex-col gap-3.5">
          <Card>
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Para pensar esta noche
            </span>
            <p className="text-sm font-semibold mt-1 leading-snug">{brief.reflectionQuestion}</p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Contéstala en tu check-in de abajo.
            </p>
          </Card>
          {brief.quote && (
            <Card>
              <blockquote className="text-sm italic leading-relaxed m-0">{brief.quote.text}</blockquote>
              {brief.quote.principle && (
                <p className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
                  Frase original inspirada en los principios de {PRINCIPIO[brief.quote.principle]}.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
