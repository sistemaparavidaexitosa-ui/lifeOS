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
import type { Franja } from "@/lib/domain/centro/franja.ts";
import { aperturaDelCentro } from "@/lib/domain/comando/voz.ts";
import { acceptProposal } from "@/lib/coach/actions";
import Apertura from "./Apertura";
import Paso from "./Paso";

export default function Navegacion({
  entrada,
  today,
  nombre,
  diaSemana,
  franja,
  pensando,
  workspaceId,
  onNavegar
}: {
  entrada: EntradaDeMando | null;
  today: string;
  nombre: string;
  diaSemana: number;
  franja: Franja;
  pensando: boolean;
  workspaceId: string | null;
  onNavegar: () => void;
}) {
  const [pospuestas, setPospuestas] = useState<string[]>([]);
  const [resueltas, setResueltas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  // Lo apartado y lo resuelto entran en la composición, no se tachan después:
  // si se anulara el ítem ya elegido, el carril quedaría en falsa calma con
  // otra tarjeta suya esperando turno, y `dominante` seguiría apuntando a algo
  // que ya no se ve.
  const mando = useMemo(
    () => (entrada ? componerMando(entrada, pospuestas, resueltas) : null),
    [entrada, pospuestas, resueltas]
  );

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

  const apertura = aperturaDelCentro({
    nombre,
    franja,
    diaSemana,
    hayPlanDeManana: entrada?.unicaCosa !== null && entrada?.unicaCosa !== undefined,
    bloqueos: mando?.estado.bloqueos ?? 0
  });
  // Mientras no hay contenido, el Centro ya te habla: la apertura es
  // determinista y no espera a nadie. Lo único que falta debajo es lo que se
  // está buscando, y los tres puntos lo dicen.
  if (!mando) {
    return (
      <div className="centro-nav">
        <Apertura apertura={apertura} pensando resumen="" />
      </div>
    );
  }

  // El primero de la lista es el que se enseña. Los demás esperan detrás: al
  // resolverlo o apartarlo, sube el siguiente — que puede ser de otro frente.
  const actual = mando.items[0] ?? null;

  return (
    <div className="centro-nav">
      <Apertura apertura={apertura} pensando={pensando} resumen={mando.estado.resumen} />

      {actual ? (
        <Paso
          key={actual.id}
          item={actual}
          today={today}
          quedan={mando.items.length - 1}
          pendiente={pendiente}
          onResuelto={(id) => setResueltas((prev) => (prev.includes(id) ? prev : [...prev, id]))}
          onAhoraNo={(id) => setPospuestas((prev) => (prev.includes(id) ? prev : [...prev, id]))}
          onAceptar={aceptar}
          onNavegar={onNavegar}
        />
      ) : (
        // Un día resuelto no puede ser un callejón sin salida: el cierre ofrece
        // las tres entradas con el estado de cada frente, para poder navegar sin
        // tener nada pendiente.
        <section className="rit-step centro-cierre">
          <h2 className="centro-paso-titulo">{mando.cierre}</h2>
          <ul className="centro-cierre-frentes">
            {mando.frentes.map((f) => (
              <li key={f.carril}>
                <span className="rit-muted">{f.estado}</span>
                <a className="rit-skip" href={f.href} onClick={onNavegar}>
                  {f.destino}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p className="centro-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
