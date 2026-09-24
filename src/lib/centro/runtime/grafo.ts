// src/lib/centro/runtime/grafo.ts
// El grafo, visto desde el runtime del Centro (D-190). SERVIDOR.
//
// Es el ÚNICO archivo del runtime que sabe que el grafo vive en Supabase, y ni
// siquiera lo toca: pasa por `src/lib/data/graph.ts`, que ya tiene la RLS, el
// mapeo de filas y la distinción entre «vacío» y «roto».
//
// Un salto desde la tarea por `belongs_to`, y no el primer proyecto que
// aparezca: con `depends_on` entre proyectos (#33) una tarea puede tener a un
// salto un proyecto que no es el suyo.

import { loadSubgraph, nodeForEntity } from "@/lib/data/graph";
import { GRAPH_VIEWS } from "@/lib/domain/graph/views";
import type { LectorDelGrafo } from "@/lib/domain/centro/runtime/hoy.ts";

export const lectorDelGrafo: LectorDelGrafo = {
  async proyectoDeTarea(taskId) {
    const { root } = await nodeForEntity(taskId);
    if (!root) return null;

    const sub = await loadSubgraph(root.nodeId, GRAPH_VIEWS.project, 1, 50);
    const vecinos = new Set(
      sub.edges
        .filter((e) => e.relType === "belongs_to" && (e.sourceId === root.nodeId || e.targetId === root.nodeId))
        .flatMap((e) => [e.sourceId, e.targetId])
    );
    const proyecto = sub.nodes.find((n) => n.nodeType === "project" && n.entityId && vecinos.has(n.id));
    return proyecto?.entityId ? { id: proyecto.entityId, titulo: proyecto.label } : null;
  }
};
