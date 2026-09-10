// Árbol cuaternario sobre los nodos del lienzo.
//
// PARA QUÉ SIRVE, QUE SON DOS COSAS DISTINTAS
//   1. Saber qué nodo hay bajo el cursor. Recorrer cien mil nodos en cada
//      `mousemove` son cien mil comparaciones sesenta veces por segundo; el
//      árbol lo deja en la profundidad del árbol, que son unas quince.
//   2. Agrupar masas para el auto-layout (Barnes-Hut, ver layout.ts). Es el
//      mismo árbol: un cuadrante lejano se resume en su centro de masa en vez
//      de sumar la fuerza de cada nodo que contiene.
//
// POR QUÉ SE RECONSTRUYE ENTERO EN CADA PASO DEL LAYOUT
// Porque es más barato que mantenerlo. Construir uno de diez mil puntos son
// unos pocos milisegundos, y un árbol con inserción y borrado incremental
// necesita rebalanceo, que es donde viven los errores raros. El layout corre en
// un trabajador aparte, así que esos milisegundos no le quitan un solo
// fotograma a nadie.

import type { Rect } from "./types.ts";

export interface QuadPoint {
  id: string;
  x: number;
  y: number;
}

interface QuadNode {
  bounds: Rect;
  points: QuadPoint[];
  children: QuadNode[] | null;
  /** Para Barnes-Hut: cuántos puntos cuelgan y dónde está su centro de masa. */
  count: number;
  cx: number;
  cy: number;
}

/**
 * Cuántos puntos caben en una hoja antes de partirla.
 *
 * Ocho y no uno: con uno, mil puntos casi coincidentes generan mil niveles de
 * profundidad y el árbol degenera en una lista enlazada carísima. Con ocho, la
 * comparación lineal dentro de la hoja es más rápida que bajar un nivel más.
 */
const CAPACIDAD = 8;

/**
 * Tope de profundidad. Es la red contra el caso patológico: dos nodos en
 * exactamente la misma coordenada no se separan por mucho que se subdivida, y
 * sin este tope el árbol crece hasta desbordar la pila. Pasa de verdad —dos
 * tareas creadas a la vez nacen en el mismo sitio hasta que el layout corre—.
 */
const PROFUNDIDAD_MAX = 16;

function crear(bounds: Rect): QuadNode {
  return { bounds, points: [], children: null, count: 0, cx: 0, cy: 0 };
}

function dentro(b: Rect, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

function solapan(a: Rect, b: Rect): boolean {
  return !(b.x > a.x + a.width || b.x + b.width < a.x || b.y > a.y + a.height || b.y + b.height < a.y);
}

function partir(nodo: QuadNode): void {
  const { x, y, width, height } = nodo.bounds;
  const hw = width / 2;
  const hh = height / 2;
  nodo.children = [
    crear({ x, y, width: hw, height: hh }),
    crear({ x: x + hw, y, width: hw, height: hh }),
    crear({ x, y: y + hh, width: hw, height: hh }),
    crear({ x: x + hw, y: y + hh, width: hw, height: hh })
  ];
}

function insertar(nodo: QuadNode, p: QuadPoint, prof: number): void {
  // El centro de masa se acumula al BAJAR, no al final: así un recorrido de
  // Barnes-Hut puede parar en cualquier nivel y encontrarlo ya calculado.
  nodo.cx = (nodo.cx * nodo.count + p.x) / (nodo.count + 1);
  nodo.cy = (nodo.cy * nodo.count + p.y) / (nodo.count + 1);
  nodo.count += 1;

  if (nodo.children === null) {
    if (nodo.points.length < CAPACIDAD || prof >= PROFUNDIDAD_MAX) {
      nodo.points.push(p);
      return;
    }
    partir(nodo);
    const previos = nodo.points;
    nodo.points = [];
    for (const q of previos) colocar(nodo, q, prof);
  }
  colocar(nodo, p, prof);
}

function colocar(nodo: QuadNode, p: QuadPoint, prof: number): void {
  const hijos = nodo.children;
  if (hijos === null) {
    nodo.points.push(p);
    return;
  }
  for (const h of hijos) {
    if (dentro(h.bounds, p.x, p.y)) {
      insertar(h, p, prof + 1);
      return;
    }
  }
  // Justo en un borde por redondeo: se queda en este nivel antes que perderse.
  nodo.points.push(p);
}

export interface Quadtree {
  /** Los puntos cuyo centro cae dentro del rectángulo. */
  query(rect: Rect): QuadPoint[];
  /** El punto más cercano a (x, y) dentro del radio, o null. */
  nearest(x: number, y: number, radius: number): QuadPoint | null;
  /** Uso interno del layout: recorre agrupando cuadrantes lejanos. */
  walk(visit: (cx: number, cy: number, count: number, width: number, leaf: QuadPoint[] | null) => boolean): void;
  readonly size: number;
}

export function buildQuadtree(points: readonly QuadPoint[], bounds?: Rect): Quadtree {
  // Un margen del 1% evita que un punto que cae justo en el borde derecho se
  // quede fuera de todos los cuadrantes por un error de coma flotante.
  const b = bounds ?? holgura(points);
  const raiz = crear(b);
  for (const p of points) {
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) insertar(raiz, p, 0);
  }

  function query(rect: Rect): QuadPoint[] {
    const out: QuadPoint[] = [];
    const pila: QuadNode[] = [raiz];
    while (pila.length > 0) {
      const n = pila.pop()!;
      if (!solapan(n.bounds, rect)) continue;
      for (const p of n.points) {
        if (dentro(rect, p.x, p.y)) out.push(p);
      }
      if (n.children !== null) pila.push(...n.children);
    }
    return out;
  }

  function nearest(x: number, y: number, radius: number): QuadPoint | null {
    const candidatos = query({ x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 });
    let mejor: QuadPoint | null = null;
    let mejorD = radius * radius;
    for (const p of candidatos) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      // `<=` y no `<`: con radio cero y un punto exacto encima, `<` no
      // encuentra nada y el clic no selecciona el nodo que está debajo.
      if (d <= mejorD) {
        mejorD = d;
        mejor = p;
      }
    }
    return mejor;
  }

  function walk(visit: (cx: number, cy: number, count: number, width: number, leaf: QuadPoint[] | null) => boolean): void {
    const pila: QuadNode[] = [raiz];
    while (pila.length > 0) {
      const n = pila.pop()!;
      if (n.count === 0) continue;
      // El visitante devuelve `true` si le basta con el resumen del cuadrante.
      const basta = visit(n.cx, n.cy, n.count, n.bounds.width, n.children === null ? n.points : null);
      if (!basta && n.children !== null) pila.push(...n.children);
    }
  }

  return { query, nearest, walk, size: raiz.count };
}

function holgura(points: readonly { x: number; y: number }[]): Rect {
  if (points.length === 0) return { x: -1, y: -1, width: 2, height: 2 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  return { x: minX - w * 0.01, y: minY - h * 0.01, width: w * 1.02, height: h * 1.02 };
}
