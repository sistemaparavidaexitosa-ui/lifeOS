// La cámara del lienzo: qué trozo del mundo se está mirando y con cuánto zoom.
//
// POR QUÉ ES DOMINIO PURO Y NO VIVE DENTRO DEL COMPONENTE
// Es la pieza donde un signo cambiado no da error, da un lienzo que se va
// andando solo al hacer zoom. Eso es carísimo de depurar mirando píxeles y
// trivial de probar con dos números, y `node --test` solo puede probar lo que
// no toca el DOM. Aquí no se importa React ni se toca `window`.
//
// EL MODELO
// `x` e `y` son la coordenada DEL MUNDO que cae en la esquina superior
// izquierda de la pantalla. Convertir es entonces una resta y una multiplicación
// en ese orden, y no hace falta ninguna matriz:
//
//     pantalla = (mundo - cámara) * escala
//     mundo    = pantalla / escala + cámara
//
// Se eligió así en vez de guardar un desplazamiento en píxeles porque hace que
// `panBy` sea independiente del zoom sin corrección ninguna: arrastrar cien
// píxeles mueve cien píxeles, se esté donde se esté.

import type { Rect } from "./types.ts";

export interface Viewport {
  /** Coordenada del mundo en la esquina superior izquierda. */
  x: number;
  y: number;
  scale: number;
  /** Tamaño del lienzo en píxeles de CSS. */
  width: number;
  height: number;
}

/**
 * Los topes del zoom.
 *
 * El mínimo NO es redondo a propósito: a 0.02 caben unos cincuenta mil nodos en
 * pantalla como puntos de un píxel, que es donde el nivel de detalle deja de
 * dibujar texto. Bajar más no enseña nada nuevo y sí multiplica el coste del
 * recorte. El máximo es donde una etiqueta de catorce píxeles llena la pantalla.
 */
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 8;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function worldToScreen(v: Viewport, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - v.x) * v.scale, y: (wy - v.y) * v.scale };
}

export function screenToWorld(v: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: sx / v.scale + v.x, y: sy / v.scale + v.y };
}

/** El rectángulo del MUNDO que se está viendo. Lo que consume el recorte. */
export function visibleWorld(v: Viewport): Rect {
  return { x: v.x, y: v.y, width: v.width / v.scale, height: v.height / v.scale };
}

/**
 * Arrastrar. `dx`/`dy` van en píxeles de pantalla, que es lo que da un evento
 * de puntero; dividir por la escala es lo que hace que el contenido siga al
 * dedo exactamente igual de lejos con zoom del 5% que del 400%.
 */
export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, x: v.x - dx / v.scale, y: v.y - dy / v.scale };
}

/**
 * Zoom ANCLADO a un punto de la pantalla.
 *
 * Es la función que separa un lienzo que se siente bien de uno que no. Si el
 * zoom se aplica al centro, la rueda del ratón aleja de la vista justo lo que
 * se estaba mirando y hay que recolocar a mano cada vez. Anclando al cursor, el
 * punto que está debajo del puntero NO SE MUEVE, que es lo que hace todo el
 * mundo desde que existe Figma.
 *
 * El truco es leer la coordenada del mundo bajo el cursor ANTES de cambiar la
 * escala y volver a colocar la cámara para que siga cayendo ahí después.
 */
export function zoomAt(v: Viewport, sx: number, sy: number, factor: number): Viewport {
  const scale = clampScale(v.scale * factor);
  // Si el zoom ya estaba topado no hay nada que anclar, y recalcular metería un
  // desplazamiento de redondeo por cada rueda contra el tope.
  if (scale === v.scale) return v;
  const before = screenToWorld(v, sx, sy);
  const next = { ...v, scale };
  const after = screenToWorld(next, sx, sy);
  return { ...next, x: next.x + (before.x - after.x), y: next.y + (before.y - after.y) };
}

/**
 * Encuadrar un rectángulo del mundo.
 *
 * `padding` va en píxeles de pantalla y no en unidades del mundo: lo que se
 * quiere es «deja un dedo de margen», y un margen en unidades del mundo se
 * encoge justo cuando el contenido es grande, que es cuando más falta hace.
 */
export function fitToBounds(v: Viewport, bounds: Rect, padding = 48): Viewport {
  // Un grafo de un solo nodo tiene un rectángulo de área cero: sin este mínimo
  // la división de abajo da Infinity y la cámara se va al infinito literal.
  const w = Math.max(bounds.width, 1);
  const h = Math.max(bounds.height, 1);
  const usableW = Math.max(v.width - padding * 2, 1);
  const usableH = Math.max(v.height - padding * 2, 1);
  const scale = clampScale(Math.min(usableW / w, usableH / h));
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return {
    ...v,
    scale,
    x: cx - v.width / (2 * scale),
    y: cy - v.height / (2 * scale)
  };
}

/** El rectángulo que contiene todos los puntos. Null si no hay ninguno. */
export function boundsOf(points: readonly { x: number; y: number }[]): Rect | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
