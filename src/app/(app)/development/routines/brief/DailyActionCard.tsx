"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { marcarAccionDelDia } from "@/lib/identity/brief-actions";
import type { BriefView } from "@/lib/identity/brief-view";

/**
 * La acción concreta del día, con su casilla.
 *
 * LA CASILLA NO ES DECORACIÓN: cierra el bucle del aprendizaje. Es la señal más
 * directa de si el brief de esta mañana movió algo, y sin ella el libro de
 * estilo solo vería cumplimiento de hábitos —que responde a muchas más cosas
 * que a lo que se leyó al despertar.
 *
 * Optimista, como las reacciones: marcar es barato y se deshace solo si falla.
 */
export default function DailyActionCard({ brief, traitNames }: { brief: BriefView; traitNames: Record<string, string> }) {
  const [done, setDone] = useState(brief.actionDone);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!brief.dailyAction) return null;
  const accion = brief.dailyAction;

  function alternar() {
    const siguiente = !done;
    setDone(siguiente);
    setError(null);
    startTransition(async () => {
      const r = await marcarAccionDelDia({ briefId: brief.id, done: siguiente });
      if (!r.ok) {
        setDone(!siguiente);
        setError(r.reason ?? "No se pudo guardar.");
      }
    });
  }

  return (
    <Card>
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        Tu acción de hoy
      </span>
      <label className="flex items-start gap-3 mt-2 cursor-pointer">
        <input type="checkbox" checked={done} onChange={alternar} disabled={pending} className="mt-1 flex-shrink-0" />
        <span className="grow min-w-0">
          <span
            className="block text-sm font-semibold leading-snug"
            style={{ textDecoration: done ? "line-through" : undefined, opacity: done ? 0.6 : 1 }}
          >
            {accion.text}
          </span>
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>
            {accion.traitId && traitNames[accion.traitId] ? `Vota por ${traitNames[accion.traitId]}` : accion.area ?? "Hoy, no esta semana"}
          </span>
        </span>
      </label>
      {error && (
        <p className="text-xs mt-2 m-0" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </Card>
  );
}
