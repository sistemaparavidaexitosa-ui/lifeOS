"use client";

import { useState, useTransition } from "react";
import { contenidoParaRepetir } from "@/lib/ritual/actions";
import type { ContenidoDelRitual } from "@/lib/data/ritual";
import RitualOverlay from "./RitualOverlay";

/**
 * «Repetir el arranque de hoy» (D-165).
 *
 * Monta el MISMO overlay que la puerta del layout, con el contenido recién
 * pedido. Una clave nueva en cada apertura para que el overlay arranque desde el
 * primer paso y no desde donde se quedó la vez anterior.
 */
export default function RepetirArranque({ currency, locale }: { currency: string; locale: string }) {
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState<{ contenido: ContenidoDelRitual; blocking: boolean; clave: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        className="btn-ghost btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await contenidoParaRepetir();
            if (!r.ok) {
              setError(r.reason);
              return;
            }
            setError(null);
            setAbierto({ contenido: r.contenido, blocking: r.blocking, clave: Date.now() });
          })
        }
      >
        {pending ? "Preparando…" : "Repetir el arranque de hoy"}
      </button>
      {error && (
        <span className="text-xs" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
      {abierto && (
        <RitualOverlay
          key={abierto.clave}
          entrada={abierto.contenido}
          blocking={abierto.blocking}
          identidadDeclarada={abierto.contenido.identidadDeclarada}
          hayBriefDeHoy={abierto.contenido.hayBriefDeHoy}
          briefIntentadoHoy={abierto.contenido.briefIntentadoHoy}
          currency={currency}
          locale={locale}
        />
      )}
    </>
  );
}
