"use client";

import Link from "next/link";
import type { ClusterBy } from "@/lib/domain/graph/cluster";
import { GRAPH_VIEWS, VIEW_ORDER, type GraphViewId } from "@/lib/domain/graph/views";

// La barra del lienzo. Las pestañas salen de GRAPH_VIEWS, no de una lista
// escrita a mano: añadir una vista es añadir un objeto en views.ts y aparece
// aquí sola.

export default function GraphToolbar({
  view, rootLabel, cluster, onCluster, onFit, truncated, total
}: {
  view: GraphViewId;
  rootLabel: string | null;
  cluster: ClusterBy;
  onCluster(next: ClusterBy): void;
  onFit(): void;
  truncated: boolean;
  total: number;
}) {
  return (
    <div className="gr-toolbar">
      <nav className="gr-tabs" aria-label="Vistas del grafo">
        {VIEW_ORDER.map((id) => (
          <Link
            key={id}
            href={`/graph?view=${id}`}
            className={`gr-tab${id === view ? " active" : ""}`}
            title={GRAPH_VIEWS[id].hint}
            aria-current={id === view ? "page" : undefined}
          >
            {GRAPH_VIEWS[id].label}
          </Link>
        ))}
      </nav>

      <div className="gr-toolbar-right">
        {rootLabel !== null && <span className="gr-muted gr-root">desde «{rootLabel}»</span>}

        <label className="gr-select">
          <span className="sr-only">Agrupar</span>
          <select value={cluster} onChange={(e) => onCluster(e.target.value as ClusterBy)}>
            <option value="none">Sin agrupar</option>
            <option value="parent">Agrupar por contenedor</option>
            <option value="type">Agrupar por tipo</option>
          </select>
        </label>

        <button type="button" className="gr-btn" onClick={onFit}>Encajar</button>

        <span className="gr-muted">{total} nodos</span>
        {truncated && (
          // Un grafo recortado en silencio parece completo, y eso es peor que
          // uno vacío: alguien decidiría mirando una respuesta incompleta.
          <span className="gr-aviso-inline" title="El recorrido tocó su tope">recortado</span>
        )}
      </div>
    </div>
  );
}
