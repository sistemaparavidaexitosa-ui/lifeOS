// El informe de impacto: convertir las filas de `graph_impact` en respuestas.
//
// QUÉ DEVUELVE POSTGRES Y QUÉ FALTA
// La RPC devuelve una fila por nodo alcanzado, con su profundidad MÍNIMA y el
// padre por el que se llegó. Eso ya es un árbol —encadenando padres se sube
// hasta la raíz—, pero no es todavía ninguna de las seis cosas que la pantalla
// tiene que contestar. Traducirlo es aritmética sobre un array, así que se hace
// aquí, donde se puede probar sin base de datos, y no en la consulta.
//
// POR QUÉ EL CAMINO CRÍTICO SE CALCULA ASÍ
// El recorrido devuelve la profundidad mínima de cada nodo, así que el nodo más
// profundo es el final de la cadena más larga QUE EL RECORRIDO ENCONTRÓ.
// Subiendo por sus padres se recupera esa cadena entera. Eso no es el camino
// crítico de la teoría de grafos —que pondera por duración y exige un DAG—,
// y no se le llama así por casualidad: es «la cadena de dependencias más larga
// que sale de aquí», que es la pregunta que la gente hace de verdad al mirar
// una tarea. Si algún día hay duraciones fiables en `tasks.est`, ponderar es
// cambiar el criterio de `masProfundo` y nada más.

import type { GraphNodeType } from "./types.ts";

export interface ImpactRow {
  nodeId: string;
  parentId: string | null;
  viaRel: string | null;
  depth: number;
  label: string;
  nodeType: GraphNodeType;
  entityTable: string | null;
  entityId: string | null;
}

export interface ImpactReport {
  /** Lo que cuelga directamente. Un salto. */
  direct: ImpactRow[];
  /** Lo que cuelga a través de otra cosa. Dos saltos o más. */
  indirect: ImpactRow[];
  /**
   * Lo que se rompe si esto cambia: lo alcanzado por una relación de bloqueo
   * de verdad, no por pertenencia. Que una tarea esté DENTRO de un proyecto no
   * significa que cambiar el proyecto la rompa.
   */
  breaking: ImpactRow[];
  /** La cadena más larga, de la raíz al nodo más profundo. */
  criticalPath: ImpactRow[];
  /** Hasta dónde llega. Cero si no depende nada. */
  maxDepth: number;
  total: number;
  /** El recorrido tocó su tope: hay más de lo que se está enseñando. */
  truncated: boolean;
}

/**
 * Las relaciones que significan «si esto cambia, aquello se rompe».
 *
 * `belongs_to` y `child_of` se quedan fuera a conciencia: expresan estructura,
 * no fragilidad. Meterlas haría que cualquier proyecto «rompiese» sus doscientas
 * tareas, y un aviso que sale siempre no es un aviso.
 */
const ROMPEN = new Set(["depends_on", "blocks", "leads_to", "caused_by"]);

export function buildImpactReport(rows: readonly ImpactRow[], truncated = false): ImpactReport {
  const direct = rows.filter((r) => r.depth === 1);
  const indirect = rows.filter((r) => r.depth > 1);
  const breaking = rows.filter((r) => r.viaRel !== null && ROMPEN.has(r.viaRel));

  let maxDepth = 0;
  for (const r of rows) if (r.depth > maxDepth) maxDepth = r.depth;

  return {
    direct,
    indirect,
    breaking,
    criticalPath: criticalPath(rows),
    maxDepth,
    total: rows.length,
    truncated
  };
}

/**
 * La cadena más larga, de la raíz hacia fuera.
 *
 * Empatan varios nodos a la misma profundidad casi siempre; se desempata por
 * etiqueta para que la respuesta sea ESTABLE. Sin ese desempate, abrir el mismo
 * nodo dos veces enseñaría dos caminos distintos y la pantalla parecería rota.
 */
export function criticalPath(rows: readonly ImpactRow[]): ImpactRow[] {
  if (rows.length === 0) return [];
  const porId = new Map(rows.map((r) => [r.nodeId, r]));

  let fin: ImpactRow | null = null;
  for (const r of rows) {
    if (fin === null || r.depth > fin.depth || (r.depth === fin.depth && r.label.localeCompare(fin.label, "es") < 0)) {
      fin = r;
    }
  }
  if (fin === null) return [];

  const cadena: ImpactRow[] = [];
  const visto = new Set<string>();
  let actual: ImpactRow | undefined = fin;
  // El `visto` no es paranoia: las aristas 'system' no se comprueban contra
  // ciclos (0054 §8), así que un ciclo heredado del dominio puede llegar hasta
  // aquí. Sin esta guarda, la pantalla se colgaría en vez de enseñarlo.
  while (actual !== undefined && !visto.has(actual.nodeId)) {
    visto.add(actual.nodeId);
    cadena.push(actual);
    actual = actual.parentId === null ? undefined : porId.get(actual.parentId);
  }
  return cadena.reverse();
}

/** Cuántos hay de cada tipo. Alimenta las pastillas del panel lateral. */
export function countByType(rows: readonly ImpactRow[]): { nodeType: GraphNodeType; count: number }[] {
  const conteo = new Map<GraphNodeType, number>();
  for (const r of rows) conteo.set(r.nodeType, (conteo.get(r.nodeType) ?? 0) + 1);
  return [...conteo.entries()]
    .map(([nodeType, count]) => ({ nodeType, count }))
    .sort((a, b) => b.count - a.count || a.nodeType.localeCompare(b.nodeType));
}
