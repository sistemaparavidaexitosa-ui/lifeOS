// Las formas del grafo, del lado del navegador.
//
// POR QUÉ NO SE USAN LOS TIPOS GENERADOS DE LA BASE
// Mismo criterio que el resto del repo: `database.types.ts` describe FILAS, con
// snake_case y con todas las columnas. Lo que el lienzo necesita pintar son
// nodos, con camelCase y con lo justo. El mapeo se hace una vez en el borde
// (src/lib/data/graph.ts) y a partir de ahí nadie vuelve a pensar en columnas.
//
// POR QUÉ `x` E `y` NO ESTÁN EN `GraphNode`
// Porque en la base tampoco: viven en `graph_layouts`, que es una tabla por
// persona y por vista. Aquí se separan igual —`NodePosition`— para que quede
// claro que mover un nodo NO modifica el nodo, y que dos vistas del mismo nodo
// pueden estar en sitios distintos a la vez.

/** Los dieciocho tipos del catálogo `graph_node_types`. */
export type GraphNodeType =
  | "workspace" | "project" | "task" | "goal" | "habit" | "routine"
  | "book" | "note" | "document" | "decision" | "person"
  | "investment" | "budget" | "asset"
  | "ai_conversation" | "meeting" | "risk" | "custom";

/** Las catorce del catálogo `graph_rel_types`. */
export type GraphRelType =
  | "depends_on" | "blocks" | "leads_to" | "caused_by"
  | "child_of" | "parent_of" | "belongs_to" | "supports"
  | "references" | "created_from" | "generated_by_ai" | "assigned_to"
  | "related_to" | "duplicates";

export type GraphScope = "workspace" | "user";

/** De dónde salió una arista. `system` no se puede borrar desde el lienzo. */
export type GraphEdgeOrigin = "user" | "system" | "ai";

export interface GraphNode {
  id: string;
  label: string;
  nodeType: GraphNodeType;
  scope: GraphScope;
  /** Qué fila del dominio describe. Null en los nodos dibujados a mano. */
  entityTable: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  /** Profundidad a la que se encontró desde la raíz del recorrido. */
  depth: number;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relType: GraphRelType;
  origin: GraphEdgeOrigin;
  weight: number | null;
  confidence: number | null;
}

export interface NodePosition {
  x: number;
  y: number;
}

/** Lo que devuelve la RPC `graph_subgraph` más sus aristas, ya mapeado. */
export interface Subgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /**
   * El recorrido tocó su tope y hay más grafo del que se está viendo. La
   * interfaz TIENE que decirlo: un grafo recortado en silencio es peor que uno
   * vacío, porque parece completo.
   */
  truncated: boolean;
  /**
   * Por qué está vacío, si es que está vacío por un fallo y no porque no haya
   * nada. `null` = todo fue bien. Vacío y roto son cosas distintas, y una
   * pantalla que las confunde le dice a alguien que no tiene proyectos
   * mientras los tiene delante.
   */
  reason: string | null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
