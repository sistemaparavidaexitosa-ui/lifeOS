"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { searchGraph } from "@/app/(app)/graph/actions";
import { NODE_STYLES } from "@/lib/domain/graph/theme";
import type { GraphNodeType } from "@/lib/domain/graph/types";

// La búsqueda del lienzo.
//
// POR QUÉ CONTRA EL SERVIDOR Y NO SOBRE LO QUE HAY EN PANTALLA
// Porque lo que hay en pantalla es un TROZO del grafo. Buscar solo ahí daría
// «no encontrado» para cosas que existen, que es la peor respuesta posible de
// un buscador. La RPC busca por trigramas sobre todas las etiquetas que la RLS
// te deja ver, y al elegir un resultado el lienzo se recentra en ese nodo,
// trayéndolo si hacía falta.

interface Hit {
  nodeId: string;
  label: string;
  nodeType: GraphNodeType;
}

/** Lo que se espera a que alguien deje de teclear. */
const ESPERA_MS = 180;

export default function GraphSearch({ onPick }: { onPick(nodeId: string): void }) {
  const [texto, setTexto] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [, empezar] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (temporizador.current !== null) clearTimeout(temporizador.current);
    const q = texto.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    temporizador.current = setTimeout(() => {
      empezar(async () => {
        setHits(await searchGraph(q));
        setAbierto(true);
      });
    }, ESPERA_MS);
    return () => {
      if (temporizador.current !== null) clearTimeout(temporizador.current);
    };
  }, [texto]);

  return (
    <div className="gr-search">
      <input
        type="search"
        value={texto}
        placeholder="Buscar en el grafo…"
        aria-label="Buscar en el grafo"
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => setAbierto(true)}
        // El cierre va con retardo: sin él, el blur se adelanta al clic del
        // resultado y elegir con el ratón nunca llega a funcionar.
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setTexto(""); setAbierto(false); }
          if (e.key === "Enter" && hits[0] !== undefined) { onPick(hits[0].nodeId); setAbierto(false); }
        }}
      />
      {abierto && hits.length > 0 && (
        <ul className="gr-hits">
          {hits.map((h) => (
            <li key={h.nodeId}>
              <button type="button" onMouseDown={() => { onPick(h.nodeId); setAbierto(false); }}>
                <span className="gr-dot" style={{ background: `var(${NODE_STYLES[h.nodeType]?.colorVar ?? "--muted"})` }} />
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
