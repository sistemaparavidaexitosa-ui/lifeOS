"use client";

import { Card } from "@/components/ui";

/**
 * El mantra del día.
 *
 * VA ARRIBA DEL TODO Y EN GRANDE porque es lo único del brief pensado para
 * repetirse: las afirmaciones se leen una vez por la mañana, el mantra
 * acompaña el día. Si estuviera al final, con el mismo tamaño que el resto,
 * sería una frase más entre veinte.
 *
 * No se pinta nada cuando falta —lo escribió el respaldo, que no hace mantras—,
 * y esa es toda la lógica que hace falta para que un día sin agente no se vea
 * roto.
 */
export default function MantraCard({ mantra, focusArea }: { mantra: string | null; focusArea: string | null }) {
  if (!mantra) return null;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Tu mantra de hoy
        </span>
        {focusArea && (
          <span className="chip text-[11px]" title="El área en la que se concentra tu brief de hoy">
            {focusArea}
          </span>
        )}
      </div>
      <p
        className="m-0 font-semibold leading-snug"
        style={{ fontSize: "clamp(1.1rem, 1rem + 1.2vw, 1.6rem)", textWrap: "balance" }}
      >
        {mantra}
      </p>
    </Card>
  );
}
