"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { generateTodayBrief } from "@/lib/identity/brief-actions";
import type { BriefView } from "@/lib/identity/brief-view";
import BriefCard from "./BriefCard";

/**
 * Sin brief para hoy: se pide al abrir la pantalla, una vez, y se pinta en
 * cuanto llega. Un esqueleto con la forma de la tarjeta evita el salto.
 *
 * El ref impide la segunda llamada del modo estricto de React en desarrollo,
 * que aquí costaría una generación del tope diario.
 */
export default function BriefGenerator({ traitNames }: { traitNames: Record<string, string> }) {
  const [brief, setBrief] = useState<BriefView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const pedido = useRef(false);

  function pedir() {
    setCargando(true);
    setError(null);
    generateTodayBrief()
      .then((r) => {
        if (r.ok && r.brief) setBrief(r.brief);
        else setError(r.reason ?? "No se pudo generar tu brief.");
      })
      .catch(() => setError("No se pudo generar tu brief. Revisa tu conexión."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    if (pedido.current) return;
    pedido.current = true;
    pedir();
  }, []);

  if (brief) return <BriefCard initial={brief} traitNames={traitNames} />;

  if (cargando) {
    return (
      <Card>
        <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Escribiendo tu brief de hoy…
          </span>
          {[88, 72, 80, 64, 76].map((w, i) => (
            <div key={i} className="rounded" style={{ height: 12, width: `${w}%`, background: "var(--surface2)" }} />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Tu brief de hoy
        </span>
        <p className="text-sm">{error}</p>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={pedir}>
            Intentar de nuevo
          </button>
          {error?.includes("Configuración") && (
            <Link href="/settings" className="btn-ghost btn-sm">
              Ir a Configuración
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
