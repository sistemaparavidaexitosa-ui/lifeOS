// Nivel de detalle y recorte: qué se dibuja de verdad en cada fotograma.
//
// EL PROBLEMA QUE RESUELVE
// Dibujar cien mil nodos con su etiqueta son cien mil llamadas a `fillText`,
// que es la operación más cara de un lienzo 2D con diferencia. A sesenta
// fotogramas por segundo eso no existe. Pero es que además NO SE VE: a un zoom
// donde caben cien mil nodos, cada etiqueta ocuparía menos de un píxel.
//
// Las dos mitades de la respuesta:
//   - RECORTE: no dibujar lo que cae fuera de la pantalla. Baja el coste a lo
//     que se ve, que a cualquier zoom es como mucho unos pocos miles.
//   - NIVEL DE DETALLE: dibujar menos cosas de cada nodo según se aleja. Es lo
//     que convierte «unos pocos miles» en «unos pocos miles baratos».

import type { Rect } from "./types.ts";

/**
 * Los tres modos de dibujo, de más lejos a más cerca.
 *
 * `dot`: un cuadrado de 1-2 px del color del tipo. Sin borde, sin texto.
 * `circle`: la burbuja con su color y su borde, sin texto.
 * `label`: la burbuja y su etiqueta.
 */
export type DetailLevel = "dot" | "circle" | "label";

/**
 * Los cortes.
 *
 * 0.35 es donde una etiqueta de 13 px baja de 5 px de alto, que es el tamaño en
 * el que deja de leerse y empieza a ser una mancha gris. 0.12 es donde la
 * burbuja de 26 px baja de 3 px: por debajo, dibujar un círculo y dibujar un
 * punto se ven igual y el punto cuesta la mitad.
 */
export const LOD_LABEL = 0.35;
export const LOD_CIRCLE = 0.12;

export function detailFor(scale: number): DetailLevel {
  if (scale >= LOD_LABEL) return "label";
  if (scale >= LOD_CIRCLE) return "circle";
  return "dot";
}

/**
 * Cuántas etiquetas como mucho, aunque el zoom diga que caben.
 *
 * El recorte deja lo que se ve, pero «lo que se ve» puede seguir siendo tres
 * mil nodos si alguien encuadra un grupo denso. Este tope es el que garantiza
 * que el fotograma se cierra pase lo que pase; los que se quedan sin etiqueta
 * se dibujan igual, solo que como burbuja.
 */
export const MAX_ETIQUETAS = 400;

export interface Cullable {
  id: string;
  x: number;
  y: number;
}

/**
 * Los nodos que caen dentro de la vista.
 *
 * El margen extra NO es opcional: sin él, un nodo cuyo centro está justo fuera
 * de la pantalla desaparece de golpe aunque su burbuja y su etiqueta todavía
 * asomaran por el borde. Se mide en unidades del mundo, así que se calcula a
 * partir del radio de dibujo dividido por la escala.
 */
export function cull<T extends Cullable>(nodes: readonly T[], view: Rect, marginWorld: number): T[] {
  const x0 = view.x - marginWorld;
  const y0 = view.y - marginWorld;
  const x1 = view.x + view.width + marginWorld;
  const y1 = view.y + view.height + marginWorld;
  const out: T[] = [];
  for (const n of nodes) {
    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) out.push(n);
  }
  return out;
}

/**
 * Qué aristas se dibujan: solo aquellas con AL MENOS un extremo visible.
 *
 * Exigir los dos sería más barato y estaría mal: una arista que entra desde
 * fuera de la pantalla es justo la que dice «esto depende de algo que no estás
 * viendo», que es la información más valiosa del lienzo.
 */
export function cullEdges<E extends { sourceId: string; targetId: string }>(
  edges: readonly E[],
  visibles: ReadonlySet<string>
): E[] {
  const out: E[] = [];
  for (const e of edges) {
    if (visibles.has(e.sourceId) || visibles.has(e.targetId)) out.push(e);
  }
  return out;
}

/**
 * A quién le toca etiqueta cuando no hay para todos.
 *
 * Se prioriza por «importancia» —el grado, que es cuántas cosas cuelgan de
 * ese nodo— y no por cercanía al centro ni por orden de llegada. Si hay que
 * elegir cuatrocientos nombres de entre tres mil, los que hay que enseñar son
 * los concentradores: son los que orientan. Un nodo hoja sin etiqueta se
 * entiende por dónde está; un concentrador sin etiqueta deja la zona muda.
 */
export function pickLabels<T extends { id: string }>(
  nodes: readonly T[],
  degree: ReadonlyMap<string, number>,
  max = MAX_ETIQUETAS
): Set<string> {
  if (nodes.length <= max) return new Set(nodes.map((n) => n.id));
  const ordenados = [...nodes].sort(
    (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id)
  );
  return new Set(ordenados.slice(0, max).map((n) => n.id));
}

/** El grado de cada nodo. Lo consumen `pickLabels` y el layout. */
export function degreeOf(edges: readonly { sourceId: string; targetId: string }[]): Map<string, number> {
  const g = new Map<string, number>();
  for (const e of edges) {
    g.set(e.sourceId, (g.get(e.sourceId) ?? 0) + 1);
    g.set(e.targetId, (g.get(e.targetId) ?? 0) + 1);
  }
  return g;
}
