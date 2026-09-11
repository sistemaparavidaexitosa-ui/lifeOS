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

/**
 * El tope de AMPLIACIÓN al encuadrar. Distinto de `MAX_SCALE`, que es lo que
 * permite el zoom manual.
 *
 * Sin esto, encuadrar un grafo de un solo nodo daba 8x: el rectángulo tiene
 * área cero, el mínimo de 1 de abajo evita la división por cero, y la escala
 * se iba al tope. En un teléfono eso pintaba un proyecto con 320 px de
 * diámetro dentro de un lienzo de 366 px, que es el «se ven muy grandes» que
 * se reportó. Encuadrar sirve para que QUEPA lo que hay; nunca para agrandarlo
 * por encima de su tamaño natural.
 */
export const MAX_FIT_SCALE = 1;

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
  const scale = Math.min(MAX_FIT_SCALE, clampScale(Math.min(usableW / w, usableH / h)));
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


/**
 * Centrar un punto del mundo, opcionalmente cambiando el zoom.
 *
 * Sin `scale` el zoom no se toca, que es lo que se quiere al saltar a un
 * resultado del buscador: mover la cámara Y el zoom a la vez desorienta porque
 * se pierde la referencia de dónde estabas.
 *
 * Con `scale` es la salida para pantallas estrechas. Encuadrar ciento sesenta
 * tareas en 366 px da una escala de 0,03, y a esa escala no se dibuja una sola
 * etiqueta: son puntos de colores sin nombre. Ver diez nodos con su nombre y
 * poder moverte es útil; ver ciento sesenta puntos mudos no lo es.
 */
export function focusAt(v: Viewport, point: { x: number; y: number }, scale?: number): Viewport {
  const s = scale === undefined ? v.scale : clampScale(scale);
  return { ...v, scale: s, x: point.x - v.width / (2 * s), y: point.y - v.height / (2 * s) };
}

/**
 * El pellizco de dos dedos: zoom y desplazamiento a la vez.
 *
 * La propiedad que lo hace sentir bien es la misma que la del zoom con rueda
 * anclado al cursor: el punto del mundo que está en el PUNTO MEDIO entre los
 * dos dedos no se mueve. Se lee ese punto antes de cambiar la escala y se
 * recoloca la cámara para que siga cayendo bajo el nuevo punto medio, lo que
 * de paso da el desplazamiento gratis —arrastrar dos dedos juntos mueve el
 * lienzo sin escribir una línea más—.
 */
export function pinch(
  v: Viewport,
  a0: { x: number; y: number }, b0: { x: number; y: number },
  a1: { x: number; y: number }, b1: { x: number; y: number }
): Viewport {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  // Dedos que acaban juntos en el mismo punto: la razón sería Infinity. Se
  // conserva la escala y se aplica solo el desplazamiento del punto medio.
  const razon = d0 > 1 && d1 > 1 ? d1 / d0 : 1;
  const scale = clampScale(v.scale * razon);

  const medio0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const medio1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const anclaje = screenToWorld(v, medio0.x, medio0.y);
  const conEscala = { ...v, scale };
  const despues = screenToWorld(conEscala, medio1.x, medio1.y);
  return { ...conEscala, x: conEscala.x + (anclaje.x - despues.x), y: conEscala.y + (anclaje.y - despues.y) };
}


/**
 * Por debajo de este ancho de lienzo se deja de intentar que quepa todo.
 *
 * 640 px es donde una pantalla deja de tener sitio para varias columnas de
 * nodos con sus nombres, y coincide a propósito con el corte que ya usa
 * `globals.css` para esconder la ayuda y el minimapa del lienzo.
 */
export const ANCHO_ESTRECHO = 640;

/**
 * Dónde poner la cámara al abrir el lienzo.
 *
 * Encuadrar TODO es lo correcto mientras todo quepa legible. Deja de serlo en
 * un teléfono: ciento sesenta tareas en 366 px dan una escala de 0,03, y por
 * debajo del umbral de etiqueta no se dibuja un solo nombre —son puntos de
 * colores mudos—. Eso fue el «no se ven los proyectos» que se reportó desde un
 * iPhone.
 *
 * La salida no es apretar más el dibujo, es dejar de intentarlo: se centra en
 * la raíz del recorrido a una escala en la que se lean los nombres y se navega
 * desde ahí. Ver diez nodos con su nombre y poder moverte es útil; ver ciento
 * sesenta puntos sin nombre no lo es.
 *
 * En pantalla ancha no cambia nada: encuadrar sigue siendo lo que se quiere.
 */
export function frameFor(
  v: Viewport,
  bounds: Rect,
  rootPosition: { x: number; y: number } | null,
  minLegible: number
): Viewport {
  const encaje = fitToBounds(v, bounds);
  if (v.width >= ANCHO_ESTRECHO || encaje.scale >= minLegible) return encaje;
  return rootPosition === null ? encaje : focusAt(v, rootPosition, minLegible);
}
