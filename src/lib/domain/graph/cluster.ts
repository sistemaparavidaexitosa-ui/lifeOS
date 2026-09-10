// Agrupación: cuando hay demasiados nodos, enseñar montones en vez de puntos.
//
// EL CASO QUE LO JUSTIFICA
// Un espacio con cuarenta proyectos y tres mil tareas, visto entero, es una
// nube gris. No es que vaya lento —el recorte y el nivel de detalle ya lo
// resuelven—: es que no DICE nada. Agrupar las tareas de cada proyecto en un
// solo montón con su cuenta devuelve la forma del espacio, y expandir el montón
// devuelve el detalle cuando hace falta.
//
// TRES CRITERIOS, Y NINGUNO ES «EL BUENO»
//   - por tipo: la lectura de arriba, «¿de qué está hecho esto?».
//   - por padre: la que casi siempre se quiere en Proyecto y Espacio, porque
//     coincide con cómo está organizado el trabajo de verdad.
//   - ninguno: cuando el grafo es pequeño, agrupar estorba.
// La elección es del usuario y vive en la barra de herramientas.

import type { GraphEdge, GraphNode, GraphNodeType } from "./types.ts";

export type ClusterBy = "none" | "type" | "parent";

export interface Cluster {
  id: string;
  label: string;
  nodeType: GraphNodeType;
  memberIds: string[];
}

export interface Clustered {
  /** Los nodos que se dibujan sueltos. */
  nodes: GraphNode[];
  clusters: Cluster[];
  /** De cada nodo agrupado, a qué montón fue. Lo usa el dibujo de aristas. */
  clusterOf: Map<string, string>;
}

/**
 * A partir de cuántos hermanos se forma un montón.
 *
 * Cinco: agrupar tres tareas ahorra dos puntos y esconde tres nombres, que es
 * un mal negocio. A partir de cinco, el montón ocupa menos que sus miembros y
 * la etiqueta del montón («12 tareas») dice más que doce etiquetas ilegibles.
 */
export const MINIMO_PARA_AGRUPAR = 5;

export function clusterGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  by: ClusterBy,
  expandidos: ReadonlySet<string> = new Set()
): Clustered {
  if (by === "none") {
    return { nodes: [...nodes], clusters: [], clusterOf: new Map() };
  }

  const grupos = by === "type" ? porTipo(nodes) : porPadre(nodes, edges);
  const sueltos: GraphNode[] = [];
  const clusters: Cluster[] = [];
  const clusterOf = new Map<string, string>();
  const porId = new Map(nodes.map((n) => [n.id, n]));

  for (const [clave, miembros] of grupos) {
    // Un montón abierto no es un montón: se dibujan sus miembros.
    if (miembros.length < MINIMO_PARA_AGRUPAR || expandidos.has(clave)) {
      for (const id of miembros) {
        const n = porId.get(id);
        if (n !== undefined) sueltos.push(n);
      }
      continue;
    }
    const primero = porId.get(miembros[0]!);
    if (primero === undefined) continue;
    clusters.push({
      id: clave,
      label: etiqueta(clave, primero.nodeType, miembros.length, porId),
      nodeType: primero.nodeType,
      memberIds: miembros
    });
    for (const id of miembros) clusterOf.set(id, clave);
  }

  return { nodes: sueltos, clusters, clusterOf };
}

function porTipo(nodes: readonly GraphNode[]): Map<string, string[]> {
  const g = new Map<string, string[]>();
  for (const n of nodes) {
    const k = `tipo:${n.nodeType}`;
    const l = g.get(k) ?? [];
    l.push(n.id);
    g.set(k, l);
  }
  return g;
}

/**
 * Agrupa por «de quién cuelga», siguiendo las aristas de pertenencia.
 *
 * Un nodo sin padre —o con más de uno— se queda suelto en su propia clave. Que
 * un nodo con dos padres no se agrupe es deliberado: meterlo en uno de los dos
 * montones al azar escondería una de las dos relaciones, y esa relación es
 * justo lo raro que merece la pena ver.
 */
function porPadre(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): Map<string, string[]> {
  const padres = new Map<string, string[]>();
  for (const e of edges) {
    if (e.relType !== "belongs_to" && e.relType !== "child_of") continue;
    const l = padres.get(e.sourceId) ?? [];
    l.push(e.targetId);
    padres.set(e.sourceId, l);
  }

  const g = new Map<string, string[]>();
  for (const n of nodes) {
    const p = padres.get(n.id);
    const k = p !== undefined && p.length === 1 ? `padre:${p[0]}:${n.nodeType}` : `suelto:${n.id}`;
    const l = g.get(k) ?? [];
    l.push(n.id);
    g.set(k, l);
  }
  return g;
}

const PLURAL: Record<GraphNodeType, string> = {
  workspace: "espacios", project: "proyectos", task: "tareas", goal: "metas",
  habit: "hábitos", routine: "rutinas", book: "libros", note: "notas",
  document: "documentos", decision: "decisiones", person: "personas",
  investment: "inversiones", budget: "presupuestos", asset: "activos",
  ai_conversation: "conversaciones", meeting: "reuniones", risk: "riesgos",
  custom: "nodos"
};

/**
 * «12 tareas en «Mudanza»» dice bastante más que «12 tareas». Cuando la clave
 * lleva el identificador del padre, se busca su etiqueta; si el padre no está
 * en el subgrafo cargado —pasa al expandir desde un borde— se cae al nombre del
 * tipo, que sigue siendo cierto.
 */
function etiqueta(clave: string, tipo: GraphNodeType, n: number, porId: ReadonlyMap<string, GraphNode>): string {
  const nombre = PLURAL[tipo];
  if (clave.startsWith("padre:")) {
    const padreId = clave.split(":")[1] ?? "";
    const padre = porId.get(padreId);
    if (padre !== undefined) return `${n} ${nombre} en «${padre.label}»`;
  }
  return `${n} ${nombre}`;
}
