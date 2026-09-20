"use client";
// src/components/comando/CentroDeMando.tsx
// El centro de mando (D-176).
//
// LA JERARQUÍA ES EL DISEÑO, NO LA DECORACIÓN
// D-169 mató el centro-tablero porque «se leía como un panel con un widget», y
// esta pantalla podría volver a serlo con solo apilar secciones. Lo que lo
// impide es el reparto: UNA cosa grande arriba —lo que deberías hacer—, lo que
// te frena aparte porque no es lo mismo, y el resto en filas compactas que se
// barren de un vistazo. Si algún día esto se lee como una lista de nueve cosas
// iguales, el diseño falló y la respuesta es apretar la jerarquía, no añadir
// otra sección.
//
// EL CRITERIO NO VIVE AQUÍ
// `componerMando` (domain/comando/componer.ts) decide qué va en cada sitio, y a
// su vez llama a `tarjetasDelCentro`, que es el mismo cerebro que usaba el
// centro de D-169. Este archivo solo pinta lo que le dan.
//
// UN SOLO CHAT
// La conversación sale de `useAiChat`, el mismo hook que alimenta el rail: no
// hay dos historiales. Y las propuestas del coach que ese hook trae son las que
// se convierten en tarjetas del mando, así que aceptar una aquí la retira
// también de la conversación sin escribir una línea de sincronización.

import { useMemo, useState } from "react";
import { componerMando, type EntradaDeMando } from "@/lib/domain/comando/componer.ts";
import type { PropuestaDelLienzo } from "@/lib/domain/centro/lienzo.ts";
import { useAiChat } from "@/components/chat/useAiChat";
import Conversacion from "@/components/chat/Conversacion";
import Cabecera from "./Cabecera";
import Tarjeta from "./Tarjeta";
import type { CoachProposalRow } from "@/lib/coach/actions";

/** Lo que el servidor sabe. Las propuestas llegan del chat, no de aquí. */
export type BaseDeMando = Omit<EntradaDeMando, "propuestas">;

/**
 * De la fila de `coach_proposals` a lo que el lienzo entiende.
 *
 * `motivo` sale de `detalle` y el destino de `payload.href`, que es donde
 * `acceptProposal` ya los guarda. No se inventa ninguno de los dos: una
 * propuesta sin detalle se queda sin motivo, y se pinta igual.
 */
function comoPropuesta(p: CoachProposalRow): PropuestaDelLienzo {
  return {
    id: p.id,
    tipo: p.tipo,
    titulo: p.titulo,
    motivo: p.detalle ?? "",
    href: p.payload?.href ?? null
  };
}

const VACIO = (
  <div className="text-xs" style={{ color: "var(--muted)" }}>
    Escríbeme y decido contigo: puedo mirar tu semana, tus metas, tu dinero, tu agenda o tu tablero, y también buscar en
    internet cuando hace falta.
  </div>
);

export default function CentroDeMando({
  base,
  today,
  workspaceId,
  saludo,
  nombre,
  fecha
}: {
  base: BaseDeMando;
  /** El día de la persona, ya resuelto en su zona. Nunca `new Date()` aquí. */
  today: string;
  workspaceId: string | null;
  saludo: string;
  nombre: string;
  fecha: string;
}) {
  // El chat ya lee `loadPendingProposals`: se aprovecha en vez de pedirlas otra
  // vez desde el servidor y acabar con dos listas que divergen al aceptar una.
  const chat = useAiChat(workspaceId);

  const [pospuestas, setPospuestas] = useState<string[]>([]);
  const [resueltas, setResueltas] = useState<string[]>([]);

  const mando = useMemo(() => {
    const entrada: EntradaDeMando = { ...base, propuestas: chat.propuestas.map(comoPropuesta) };
    const m = componerMando(entrada, pospuestas);

    // Lo ya resuelto se retira AQUÍ y no en el dominio: `componerMando` es puro
    // y no sabe qué tocaste en esta visita. Al caer el foco, el siguiente sube
    // solo — que es la conducta de D-169, conservada.
    const vivos = [...(m.foco ? [m.foco] : []), ...m.siguientes].filter((i) => !resueltas.includes(i.id));

    return {
      ...m,
      foco: vivos[0] ?? null,
      siguientes: vivos.slice(1),
      bloqueos: m.bloqueos.filter((b) => !resueltas.includes(b.id))
    };
  }, [base, chat.propuestas, pospuestas, resueltas]);

  function aceptar(propuestaId: string, _href: string | null, id: string) {
    const fila = chat.propuestas.find((p) => p.id === propuestaId);
    if (!fila) return;
    // `aceptarPropuesta` ya retira la fila del hook y navega si hace falta; al
    // desaparecer de `chat.propuestas`, la tarjeta se va sola del mando.
    chat.aceptarPropuesta(fila);
    setResueltas((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function ahoraNo(id: string) {
    setPospuestas((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function resuelto(id: string) {
    setResueltas((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  const acciones = {
    today,
    onResuelto: resuelto,
    onAhoraNo: ahoraNo,
    onAceptar: aceptar,
    pendiente: chat.pending
  };

  return (
    <div className="cmd">
      <Cabecera estado={mando.estado} saludo={saludo} nombre={nombre} fecha={fecha} />

      {mando.foco ? (
        <section className="cmd-seccion" aria-labelledby="cmd-hoy">
          <h2 className="cmd-seccion-titulo" id="cmd-hoy">
            Hoy deberías
          </h2>
          <Tarjeta item={mando.foco} heroe {...acciones} />
        </section>
      ) : (
        // El día sin nada no se rellena con trabajo inventado. Es la tarjeta de
        // cierre de D-169, que sobrevive entera.
        <section className="cmd-seccion">
          <p className="cmd-cierre">{mando.cierre}</p>
        </section>
      )}

      {mando.bloqueos.length > 0 && (
        <section className="cmd-seccion" aria-labelledby="cmd-frena">
          <h2 className="cmd-seccion-titulo" id="cmd-frena">
            Lo que te está frenando
          </h2>
          <div className="cmd-lista">
            {mando.bloqueos.map((b) => (
              <Tarjeta key={b.id} item={b} {...acciones} />
            ))}
          </div>
        </section>
      )}

      {mando.siguientes.length > 0 && (
        <section className="cmd-seccion" aria-labelledby="cmd-sigue">
          <h2 className="cmd-seccion-titulo" id="cmd-sigue">
            Siguiente mejor acción
          </h2>
          <div className="cmd-lista">
            {mando.siguientes.map((s) => (
              <Tarjeta key={s.id} item={s} {...acciones} />
            ))}
          </div>
        </section>
      )}

      {/* La conversación, con `sinPropuestas`: las del coach ya son tarjetas
          arriba, y pintarlas dos veces sería la bandeja que D-169 mató. */}
      <section className="cmd-feed" aria-label="Conversación">
        <Conversacion chat={chat} vacio={VACIO} sinPropuestas />
      </section>
    </div>
  );
}
