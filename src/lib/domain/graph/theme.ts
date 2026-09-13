// Cómo se ve cada cosa: tamaño y color por tipo de nodo y de relación.
//
// POR QUÉ VIVE EN DOMINIO Y NO EN EL COMPONENTE QUE DIBUJA
// Porque lo consumen tres sitios —el lienzo, el minimapa y la leyenda— y si
// cada uno tuviera su tabla, el día que cambie el color de «riesgo» cambiaría
// en dos de los tres. Además es lo único del aspecto que se puede probar.
//
// POR QUÉ SON NOMBRES DE VARIABLE CSS Y NO COLORES
// Los tokens de `globals.css` ya tienen su versión clara y su versión oscura.
// Quemar un `#hex` aquí obligaría a mantener dos tablas y a que el lienzo
// supiera en qué tema está, que es justo lo que no queremos que sepa: el
// componente lee la variable con getComputedStyle en el momento de pintar y se
// entera del tema sin preguntarle a nadie.

import { NODE_CATALOG } from "./catalog.generated.ts";
import type { GraphNodeType, GraphRelType } from "./types.ts";

export interface NodeStyle {
  /** Nombre de la variable CSS, sin `var()`. */
  colorVar: string;
  /** Radio en unidades del mundo al 100% de zoom. */
  radius: number;
}

/**
 * El radio dice JERARQUÍA, no importancia.
 *
 * Un espacio contiene proyectos y un proyecto contiene tareas, así que se ven
 * en ese orden de tamaño y el dibujo se lee sin leyenda. Los tipos privados
 * (metas, hábitos, dinero) siguen la misma escala dentro de su propio mundo,
 * porque nunca van a aparecer en el mismo lienzo que los de espacio: BR-012 lo
 * impide.
 */
const RADIO: Record<GraphNodeType, number> = {
  workspace: 26,
  project: 20,
  task: 12,
  person: 14,
  document: 10,
  note: 12,
  decision: 12,
  meeting: 12,
  goal: 20,
  routine: 16,
  habit: 11,
  book: 12,
  notebook: 16,
  investment: 16,
  budget: 14,
  asset: 14,
  account: 16,
  debt: 14,
  financial_goal: 20,
  liability: 14,
  ai_conversation: 12,
  risk: 14,
  custom: 12
};

/**
 * El color lo pone el catálogo de la base; el radio, la tabla de arriba.
 *
 * Esa frontera es la de 0060 —la base es dueña de las palabras y la semántica,
 * TypeScript de la geometría— y se sostiene sola: `RADIO` va indexado por la
 * unión generada, así que un tipo nuevo en la base no compila hasta que alguien
 * diga de qué tamaño se dibuja.
 */
export const NODE_STYLES: Record<GraphNodeType, NodeStyle> = Object.fromEntries(
  (Object.keys(NODE_CATALOG) as GraphNodeType[]).map((t) => [
    t,
    { colorVar: NODE_CATALOG[t].colorVar, radius: RADIO[t] }
  ])
) as Record<GraphNodeType, NodeStyle>;


export function styleOf(nodeType: string): NodeStyle {
  // Un tipo que no conozcamos NO puede dejar el lienzo en blanco: el catálogo
  // es una tabla y puede crecer sin que este archivo se entere.
  return NODE_STYLES[nodeType as GraphNodeType] ?? NODE_STYLES.custom;
}

export interface EdgeStyle {
  /** Discontinua para lo que no es una dependencia dura. */
  dashed: boolean;
  /** Con punta de flecha. Las relaciones simétricas no la llevan. */
  arrow: boolean;
  width: number;
}

export const EDGE_STYLES: Record<GraphRelType, EdgeStyle> = {
  depends_on:      { dashed: false, arrow: true,  width: 1.6 },
  blocks:          { dashed: false, arrow: true,  width: 1.6 },
  leads_to:        { dashed: false, arrow: true,  width: 1.4 },
  caused_by:       { dashed: false, arrow: true,  width: 1.4 },
  child_of:        { dashed: false, arrow: false, width: 1.1 },
  parent_of:       { dashed: false, arrow: false, width: 1.1 },
  belongs_to:      { dashed: false, arrow: false, width: 0.9 },
  supports:        { dashed: false, arrow: true,  width: 1.3 },
  references:      { dashed: true,  arrow: true,  width: 1 },
  created_from:    { dashed: true,  arrow: true,  width: 1 },
  generated_by_ai: { dashed: true,  arrow: true,  width: 1 },
  assigned_to:     { dashed: true,  arrow: false, width: 1 },
  related_to:      { dashed: true,  arrow: false, width: 1 },
  duplicates:      { dashed: true,  arrow: false, width: 1.2 }
};

export function edgeStyleOf(relType: string): EdgeStyle {
  return EDGE_STYLES[relType as GraphRelType] ?? EDGE_STYLES.related_to;
}

/**
 * Lee las variables CSS una vez por repintado.
 *
 * `getComputedStyle` es de las llamadas más caras del navegador porque fuerza
 * un recálculo de estilo: hacerla por nodo serían miles por fotograma y el
 * lienzo se arrastraría. Se resuelven todas de golpe y se pasan como tabla.
 */
export const COLOR_VARS = [
  "--accent", "--c-purple", "--c-pink", "--c-blue", "--c-orange",
  "--c-green", "--c-teal", "--danger", "--muted", "--text", "--surface",
  "--surface2", "--line", "--bg"
] as const;

export type ColorTable = Record<string, string>;
