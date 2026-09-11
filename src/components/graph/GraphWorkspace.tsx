"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { saveLayout } from "@/app/(app)/graph/actions";
import { clusterGraph, type ClusterBy } from "@/lib/domain/graph/cluster";
import type { GraphEdge, GraphNode, NodePosition, Rect, Subgraph } from "@/lib/domain/graph/types";
import type { Viewport } from "@/lib/domain/graph/viewport";
import type { GraphView } from "@/lib/domain/graph/views";
import GraphCanvas, { type GraphCanvasHandle } from "./GraphCanvas";
import GraphSearch from "./GraphSearch";
import GraphToolbar from "./GraphToolbar";
import Minimap from "./Minimap";
import NodeInspector from "./NodeInspector";

// El contenedor de la pantalla: es quien tiene el estado y quien habla con el
// servidor. El lienzo solo dibuja y reporta gestos.
//
// LA CARGA ES PROGRESIVA A PROPÓSITO
// La página llega con el vecindario de la raíz —dos o tres saltos, unos cientos
// de nodos— y no con el grafo entero. Traer cien mil nodos para pintar una
// pantalla de mil doscientos píxeles sería mandar megabytes que nadie va a
// mirar. Al hacer doble clic en un nodo se pide UN salto más desde ahí y se
// funde con lo que ya hay: así el grafo crece por donde la persona mira.
//
// EL MAPA DE LO YA TRAÍDO ES UN REF Y NO ESTADO
// Es caché, no interfaz: que un nodo esté ya pedido no cambia lo que se ve, así
// que meterlo en estado solo provocaría renders de más.

export interface WorkspaceOption {
  id: string;
  name: string;
  isPersonal: boolean;
}

export default function GraphWorkspace({
  view, initial, rootLabel, workspaces, activeWorkspaceId, savedPositions
}: {
  view: GraphView;
  initial: Subgraph;
  rootLabel: string | null;
  /** Los espacios que alcanzas. Vacío en las vistas privadas, que no tienen. */
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string | null;
  savedPositions: Record<string, NodePosition>;
}) {
  const [nodes, setNodes] = useState<GraphNode[]>(initial.nodes);
  const [edges, setEdges] = useState<GraphEdge[]>(initial.edges);
  const [truncated, setTruncated] = useState(initial.truncated);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  const [cluster, setCluster] = useState<ClusterBy>("none");
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(new Set());
  const [camara, setCamara] = useState<Viewport>({ x: 0, y: 0, scale: 1, width: 800, height: 600 });
  const [limites, setLimites] = useState<Rect | null>(null);
  // Si el recorrido falló —una RPC que falta porque la migración se aplicó a
  // medias, por ejemplo— el motivo llega desde el servidor y se pinta. Un
  // lienzo vacío sin explicación parece que no tienes nada.
  const [aviso, setAviso] = useState<string | null>(initial.reason);

  // El minimapa necesita las posiciones, pero estas cambian sesenta veces por
  // segundo: viven en un ref y solo se sube a estado un CONTADOR cuando se
  // estabilizan. Así el minimapa se repinta cuando hay algo nuevo que enseñar y
  // no en cada fotograma.
  const [versionPos, setVersionPos] = useState(0);
  const lienzo = useRef<GraphCanvasHandle | null>(null);
  const yaPedidos = useRef<Set<string>>(new Set());
  const posiciones = useRef<Map<string, NodePosition>>(new Map());

  // La agrupación se aplica ANTES de dar los nodos al lienzo: el lienzo no sabe
  // qué es un montón, solo dibuja nodos. Un montón es un nodo más, con su
  // etiqueta y su tipo, y expandirlo es cambiar este cálculo.
  const pintables = useMemo(() => {
    const r = clusterGraph(nodes, edges, cluster, expandidos);
    if (r.clusters.length === 0) return { nodes: r.nodes, edges };

    const monton: GraphNode[] = r.clusters.map((c) => ({
      id: c.id,
      label: c.label,
      nodeType: c.nodeType,
      scope: view.scope,
      entityTable: null,
      entityId: null,
      metadata: null,
      // Los montones se ponen a la profundidad de su primer miembro para que el
      // layout por capas siga teniendo una columna donde colocarlos.
      depth: nodes.find((n) => n.id === c.memberIds[0])?.depth ?? 1
    }));

    // Las aristas que iban a un miembro pasan a ir al montón, y las que quedan
    // dentro del mismo montón desaparecen: dibujar una arista de un montón a sí
    // mismo es un garabato.
    const alMonton = (id: string) => r.clusterOf.get(id) ?? id;
    const vistas = new Set<string>();
    const redirigidas: GraphEdge[] = [];
    for (const e of edges) {
      const s = alMonton(e.sourceId);
      const t = alMonton(e.targetId);
      if (s === t) continue;
      const clave = `${s}|${e.relType}|${t}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      redirigidas.push({ ...e, sourceId: s, targetId: t });
    }
    return { nodes: [...r.nodes, ...monton], edges: redirigidas };
  }, [nodes, edges, cluster, expandidos, view.scope]);

  const nodoSeleccionado = useMemo(() => {
    if (selected.size !== 1) return null;
    const [id] = [...selected];
    return nodes.find((n) => n.id === id) ?? null;
  }, [selected, nodes]);

  /** Doble clic: o abre un montón, o pide un salto más de grafo. */
  const activar = useCallback(async (nodeId: string) => {
    if (nodeId.startsWith("tipo:") || nodeId.startsWith("padre:")) {
      setExpandidos((prev) => new Set(prev).add(nodeId));
      return;
    }
    if (yaPedidos.current.has(nodeId)) return;
    yaPedidos.current.add(nodeId);

    try {
      const r = await fetch(`/api/graph/subgraph?root=${nodeId}&view=${view.id}&depth=1`, {
        credentials: "include"
      });
      if (r.status === 401) {
        setAviso("Tu sesión expiró. Recarga la página.");
        return;
      }
      if (!r.ok) return;
      const datos = (await r.json()) as { ok: boolean } & Subgraph;
      if (!datos.ok) return;

      // Fusión por identificador: un nodo que ya estaba no se duplica ni pierde
      // la profundidad con la que llegó la primera vez, que es la que usa el
      // layout por capas.
      setNodes((prev) => {
        const porId = new Map(prev.map((n) => [n.id, n]));
        for (const n of datos.nodes) if (!porId.has(n.id)) porId.set(n.id, n);
        return [...porId.values()];
      });
      setEdges((prev) => {
        const clave = (e: GraphEdge) => `${e.sourceId}|${e.relType}|${e.targetId}`;
        const vistas = new Set(prev.map(clave));
        return [...prev, ...datos.edges.filter((e) => !vistas.has(clave(e)))];
      });
      if (datos.truncated) setTruncated(true);
    } catch {
      // Sin red: el grafo que ya está sigue siendo utilizable, así que no se
      // interrumpe nada. Solo se permite reintentar.
      yaPedidos.current.delete(nodeId);
    }
  }, [view.id]);

  /** Solo lo movido a mano llega aquí, y solo eso se guarda. Ver GraphCanvas. */
  const guardarPosiciones = useCallback((pos: { nodeId: string; x: number; y: number }[]) => {
    for (const p of pos) posiciones.current.set(p.nodeId, { x: p.x, y: p.y });
    // Los montones no son nodos de la base: guardar su posición daría un 23503.
    const reales = pos.filter((p) => !p.nodeId.startsWith("tipo:") && !p.nodeId.startsWith("padre:"));
    if (reales.length === 0) return;
    // El tope de la acción son cien por llamada; se trocea en vez de perder los
    // que sobran en silencio.
    for (let i = 0; i < reales.length; i += 100) {
      void saveLayout(view.id, reales.slice(i, i + 100));
    }
  }, [view.id]);

  const recibirPosiciones = useCallback((pos: Map<string, NodePosition>) => {
    posiciones.current = pos;
    setVersionPos((v) => v + 1);
  }, []);

  return (
    <div className="gr-shell">
      <GraphToolbar
        view={view.id}
        rootLabel={rootLabel}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        cluster={cluster}
        onCluster={setCluster}
        onFit={() => lienzo.current?.fit()}
        truncated={truncated}
        total={nodes.length}
      />

      {aviso !== null && <p className="gr-aviso">{aviso}</p>}

      <div className="gr-body">
        <div className="gr-stage">
          <div className="gr-stage-top">
            <GraphSearch
              onPick={(id) => {
                setSelected(new Set([id]));
                void activar(id);
                lienzo.current?.focusOn(id);
              }}
            />
          </div>

          <GraphCanvas
            nodes={pintables.nodes}
            edges={pintables.edges}
            layoutMode={view.layout}
            savedPositions={savedPositions}
            selected={selected}
            highlighted={highlighted}
            onSelectedChange={setSelected}
            onNodeActivate={activar}
            onNodesMoved={guardarPosiciones}
            onPositionsChanged={recibirPosiciones}
            onViewportChange={(v, b) => {
              // Solo se sube a estado lo que el minimapa necesita, y se compara
              // antes: el lienzo llama a esto en CADA fotograma, y un setState
              // por fotograma anularía todo el trabajo de tener las posiciones
              // en refs.
              setCamara((prev) =>
                prev.x === v.x && prev.y === v.y && prev.scale === v.scale && prev.width === v.width
                  ? prev
                  : v
              );
              setLimites((prev) =>
                prev !== null && b !== null && prev.x === b.x && prev.width === b.width ? prev : b
              );
            }}
            handleRef={lienzo}
          />

          <Minimap
            nodes={pintables.nodes}
            positions={posiciones.current}
            version={versionPos}
            viewport={camara}
            bounds={limites}
            onJump={(w) => {
              const v = camara;
              setCamara({ ...v, x: w.x - v.width / (2 * v.scale), y: w.y - v.height / (2 * v.scale) });
            }}
          />

          <p className="gr-ayuda">
            Rueda para acercar · barra espaciadora o botón central para mover · arrastra para seleccionar · doble clic para expandir
          </p>
        </div>

        <NodeInspector
          node={nodoSeleccionado}
          onHighlight={setHighlighted}
          onFocus={(id) => { setSelected(new Set([id])); lienzo.current?.focusOn(id); }}
        />
      </div>
    </div>
  );
}
