"use client";
// src/components/comando/Navegacion.tsx
// La capa de navegación del Centro (D-177).
//
// QUÉ ES ESTO Y QUÉ NO
// No es una pantalla ni una pestaña: es lo que se ve al pulsar el botón
// flotante «Centro». No sustituye a la home —la home siguió siendo la home— ni
// vuelve a ser el menú de veintitrés destinos que D-169 borró.
//
// Son TRES PUERTAS, una por objetivo, y lo que hay detrás de cada una cambia
// con tu estado. Por eso es navegación generada: ninguna de las tres dice
// siempre lo mismo, y el orden con el que se destaca una sobre otra lo decide
// lo que aprieta hoy.
//
// EL CRITERIO SIGUE SIENDO EL DE D-169
// `componerMando` llama a `tarjetasDelCentro`, que ordena por lo que caduca
// antes, y se queda con el primero de cada frente. Dentro de un carril manda el
// mismo criterio de siempre; lo único nuevo es el reparto en tres.
//
// LO QUE SE VE A LA VEZ SON TRES COSAS, NO NUEVE. Es el compromiso con D-169:
// suficiente para saber si llevas una semana sin tocar el dinero, poco para que
// vuelva a ser una bandeja de entrada.

import { useMemo, useState, useTransition } from "react";
import { componerMando, type EntradaDeMando } from "@/lib/domain/comando/componer.ts";
import { acceptProposal } from "@/lib/coach/actions";
import Carril from "./Carril";

export default function Navegacion({
  entrada,
  today,
  workspaceId,
  onNavegar
}: {
  entrada: EntradaDeMando;
  today: string;
  workspaceId: string | null;
  onNavegar: () => void;
}) {
  const [pospuestas, setPospuestas] = useState<string[]>([]);
  const [resueltas, setResueltas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const mando = useMemo(() => {
    const m = componerMando(entrada, pospuestas);
    // Lo resuelto en ESTA visita se retira aquí: `componerMando` es puro y no
    // sabe qué acabas de tocar. Al caer un ítem, el siguiente de su carril sube
    // solo — la conducta de D-169, conservada.
    return {
      ...m,
      carriles: m.carriles.map((v) => (v.item && resueltas.includes(v.item.id) ? { ...v, item: null } : v))
    };
  }, [entrada, pospuestas, resueltas]);

  function aceptar(propuestaId: string, href: string | null, id: string) {
    startTransition(async () => {
      const r = await acceptProposal(propuestaId, workspaceId);
      if (!r.ok) {
        setError(r.reason ?? "No se pudo crear.");
        // `resuelta` = la propuesta ya quedó `fallida` en la base; la tarjeta se
        // retira igual porque un segundo clic solo puede fallar por lo mismo.
        if (!r.resuelta) return;
      }
      setResueltas((prev) => (prev.includes(id) ? prev : [...prev, id]));
      const destino = r.href ?? href;
      if (destino) {
        onNavegar();
        window.location.href = destino;
      }
    });
  }

  const enCalma = mando.carriles.every((v) => !v.item);

  return (
    <div className="cmd-nav">
      {/* El resumen de la franja, que ya escribe el modelo en `centro_runs`.
          Vacío no se rellena: inventar un «vas bien» que nadie calculó es lo
          que `validateAnchoring` existe para impedir en el otro extremo. */}
      {mando.estado.resumen && <p className="cmd-resumen">{mando.estado.resumen}</p>}

      {enCalma && <p className="cmd-cierre">{mando.cierre}</p>}

      <div className="cmd-carriles">
        {mando.carriles.map((via) => (
          <Carril
            key={via.carril}
            via={via}
            today={today}
            dominante={mando.dominante === via.carril}
            pendiente={pendiente}
            onResuelto={(id) => setResueltas((prev) => (prev.includes(id) ? prev : [...prev, id]))}
            onAhoraNo={(id) => setPospuestas((prev) => (prev.includes(id) ? prev : [...prev, id]))}
            onAceptar={aceptar}
            onNavegar={onNavegar}
          />
        ))}
      </div>

      {error && (
        <p className="cmd-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
