"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import HabitCheckbox from "@/components/habits/HabitCheckbox";
import { acceptProposal } from "@/lib/coach/actions";
import { tarjetasDelCentro, type EntradaLienzo, type Tarjeta } from "@/lib/domain/centro/lienzo.ts";

/**
 * El lienzo del centro (D-169): UNA cosa a la vez.
 *
 * NO ES EL RITUAL. Aquel es una secuencia con sus pasos y su flecha, y sigue
 * existiendo tal cual. Esto es una pila de cosas que atender: se resuelve la de
 * delante y entra la siguiente. No hay «paso 3 de 7» porque no hay un recorrido
 * que completar — hay un día al que responder.
 *
 * El contador sí está, pequeño: ver una cosa a la vez tiene una pega conocida,
 * no saber cuánto falta, y un número la quita sin convertir esto en una barra
 * de progreso que haya que terminar.
 */
export default function Lienzo({
  entrada,
  today,
  workspaceId,
  onCerrar,
  onNavegar
}: {
  entrada: EntradaLienzo;
  today: string;
  workspaceId: string | null;
  /** «Ahora no» en la última: cierra el centro. */
  onCerrar: () => void;
  /** Antes de navegar, para que el centro se quite de en medio. */
  onNavegar: () => void;
}) {
  const [indice, setIndice] = useState(0);
  const [pospuestas, setPospuestas] = useState<string[]>([]);
  const [resueltas, setResueltas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  const tarjetas = useMemo(
    () => tarjetasDelCentro(entrada, pospuestas).filter((t) => !resueltas.includes(t.id)),
    [entrada, pospuestas, resueltas]
  );

  const tarjeta: Tarjeta | undefined = tarjetas[Math.min(indice, tarjetas.length - 1)];
  if (!tarjeta) return null;

  // Cuántas quedan sin contar el cierre: el cierre no es una cosa que hacer.
  const quedan = tarjetas.filter((t) => t.kind !== "cierre").length - (tarjeta.kind === "cierre" ? 0 : 1);

  function siguiente() {
    setIndice((i) => Math.min(i + 1, tarjetas.length - 1));
  }

  function resolver(id: string) {
    setResueltas((r) => [...r, id]);
    setIndice(0);
  }

  function ahoraNo() {
    if (tarjeta!.kind === "cierre") {
      onCerrar();
      return;
    }
    // Apartar no es descartar: baja al final y sigue estando.
    setPospuestas((p) => (p.includes(tarjeta!.id) ? p : [...p, tarjeta!.id]));
    setIndice(0);
  }

  function ir(href: string) {
    onNavegar();
    router.push(href);
  }

  function aceptar(propuestaId: string, href: string | null, id: string) {
    startTransition(async () => {
      const r = await acceptProposal(propuestaId, workspaceId);
      if (!r.ok) {
        setError(r.reason ?? "No se pudo.");
        return;
      }
      setError(null);
      resolver(id);
      if (r.href ?? href) ir((r.href ?? href) as string);
    });
  }

  return (
    <div className="rit-lienzo rit-step" key={tarjeta.id}>
      {tarjeta.voz && <p className="rit-eyebrow">{tarjeta.voz}</p>}

      <h2 className="rit-title" tabIndex={-1} data-ritual-title>
        {tarjeta.titulo}
      </h2>

      <div className="rit-lienzo-acciones">
        {tarjeta.kind === "habito" && (
          <>
            <HabitCheckbox
              routineId={tarjeta.routineId}
              habitId={tarjeta.habitId}
              today={today}
              entry={null}
              size={64}
              onResult={(nuevo, err) => {
                setError(err);
                if (!err && nuevo) resolver(tarjeta.id);
              }}
            />
            <span className="rit-muted">Tócalo cuando lo hayas hecho</span>
          </>
        )}

        {tarjeta.kind === "propuesta" && (
          <button
            className="rit-sug-si"
            disabled={pendiente}
            onClick={() => aceptar(tarjeta.propuestaId, tarjeta.href, tarjeta.id)}
          >
            {tarjeta.accion}
          </button>
        )}

        {(tarjeta.kind === "dinero" || tarjeta.kind === "vencidas") && (
          <button className="rit-sug-si" onClick={() => ir(tarjeta.href)}>
            Abrir
          </button>
        )}

        {tarjeta.kind === "unicaCosa" && (
          <button className="rit-sug-si" onClick={() => ir("/planning")}>
            Ir a planeación
          </button>
        )}

        {tarjeta.kind === "apertura" && (
          <button className="rit-sug-si" onClick={siguiente}>
            Vale
          </button>
        )}

        {tarjeta.kind !== "cierre" && (
          <button className="rit-skip" onClick={ahoraNo} disabled={pendiente}>
            Ahora no
          </button>
        )}
      </div>

      {tarjeta.kind !== "cierre" && quedan > 0 && (
        <p className="rit-muted" style={{ marginTop: 14 }}>
          Quedan {quedan}
        </p>
      )}

      {error && (
        <p className="rit-muted" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
