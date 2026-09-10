"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Chip, EmptyState } from "@/components/ui";
import { fetchImpact } from "@/app/(app)/graph/actions";
import { countByType, type ImpactReport } from "@/lib/domain/graph/impact";
import { NODE_STYLES } from "@/lib/domain/graph/theme";
import type { GraphNode } from "@/lib/domain/graph/types";

// El panel de impacto: las seis preguntas del nodo seleccionado.
//
// Las respuestas no se calculan aquí. Postgres hace el recorrido —con dos
// conjuntos de permiso precalculados y los índices puestos— y `buildImpactReport`
// convierte esas filas en las seis respuestas. Este archivo solo las pinta.

/** De la tabla del dominio a la pantalla donde vive esa cosa de verdad. */
const RUTA_DE: Record<string, (id: string) => string> = {
  projects: (id) => `/execution?project=${id}`,
  tasks: () => "/execution",
  notes: () => "/notebooks",
  personal_goals: () => "/development/goals",
  habits: () => "/development/routines",
  routines: () => "/development/routines",
  books: () => "/development/library",
  investments: () => "/investments",
  budgets: () => "/money/budget",
  assets: () => "/wealth",
  workspaces: () => "/execution",
  memberships: () => "/execution"
};

export default function NodeInspector({
  node, onHighlight, onFocus
}: {
  node: GraphNode | null;
  onHighlight(ids: Set<string>): void;
  onFocus(nodeId: string): void;
}) {
  const [informe, setInforme] = useState<ImpactReport | null>(null);
  const [direccion, setDireccion] = useState<"downstream" | "upstream">("downstream");
  const [pendiente, empezar] = useTransition();

  useEffect(() => {
    if (node === null) {
      setInforme(null);
      onHighlight(new Set());
      return;
    }
    empezar(async () => {
      const r = await fetchImpact(node.id, direccion);
      setInforme(r);
      // Al llegar el informe se resalta el camino crítico: es la respuesta que
      // la gente viene a buscar, y enseñarla en el lienzo sin tener que pulsar
      // nada es la mitad del valor de la pantalla.
      onHighlight(new Set(r === null ? [] : r.criticalPath.map((x) => x.nodeId)));
    });
    // `onHighlight` cambia de identidad en cada render del padre; meterla en las
    // dependencias volvería a lanzar el recorrido en cada repintado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, direccion]);

  if (node === null) {
    return (
      <aside className="gr-inspector">
        <EmptyState icon="◎" text="Selecciona un nodo para ver de qué depende y qué se rompe si cambia." />
      </aside>
    );
  }

  const ruta = node.entityTable !== null && node.entityId !== null
    ? RUTA_DE[node.entityTable]?.(node.entityId) ?? null
    : null;

  return (
    <aside className="gr-inspector">
      <header className="gr-inspector-head">
        <span className="gr-dot" style={{ background: `var(${NODE_STYLES[node.nodeType]?.colorVar ?? "--muted"})` }} />
        <h2 className="gr-inspector-title">{node.label}</h2>
      </header>

      {ruta !== null && (
        <Link href={ruta} className="gr-link">Abrir donde vive →</Link>
      )}

      <div className="gr-seg" role="tablist" aria-label="Dirección del análisis">
        <button
          type="button" role="tab" aria-selected={direccion === "downstream"}
          className={direccion === "downstream" ? "active" : ""}
          onClick={() => setDireccion("downstream")}
        >
          Qué depende de esto
        </button>
        <button
          type="button" role="tab" aria-selected={direccion === "upstream"}
          className={direccion === "upstream" ? "active" : ""}
          onClick={() => setDireccion("upstream")}
        >
          De qué depende
        </button>
      </div>

      {pendiente && <p className="gr-muted">Recorriendo el grafo…</p>}

      {informe !== null && !pendiente && (
        <>
          <div className="gr-stats">
            <div><b>{informe.direct.length}</b><span>directos</span></div>
            <div><b>{informe.indirect.length}</b><span>indirectos</span></div>
            <div><b>{informe.maxDepth}</b><span>de profundidad</span></div>
          </div>

          {informe.truncated && (
            <p className="gr-aviso">
              Hay más de lo que cabe en un recorrido. Lo que ves está recortado.
            </p>
          )}

          {informe.total === 0 && (
            <p className="gr-muted">
              {direccion === "downstream"
                ? "No hay nada que dependa de esto. Se puede mover sin romper nada."
                : "Esto no depende de nada: se puede empezar cuando quieras."}
            </p>
          )}

          {informe.breaking.length > 0 && (
            <section>
              <h3 className="gr-h3">Se rompe si esto cambia</h3>
              <ul className="gr-lista">
                {informe.breaking.slice(0, 12).map((r) => (
                  <li key={r.nodeId}>
                    <button type="button" onClick={() => onFocus(r.nodeId)}>{r.label}</button>
                    <Chip kind="bad">{r.depth === 1 ? "directo" : `${r.depth} saltos`}</Chip>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {informe.criticalPath.length > 1 && (
            <section>
              <h3 className="gr-h3">Cadena más larga</h3>
              <ol className="gr-camino">
                {informe.criticalPath.map((r) => (
                  <li key={r.nodeId}>
                    <button type="button" onClick={() => onFocus(r.nodeId)}>{r.label}</button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {informe.total > 0 && (
            <section>
              <h3 className="gr-h3">Qué hay ahí dentro</h3>
              <div className="gr-chips">
                {countByType(informe.direct.concat(informe.indirect)).map((c) => (
                  <Chip key={c.nodeType}>{c.count} · {c.nodeType}</Chip>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </aside>
  );
}
