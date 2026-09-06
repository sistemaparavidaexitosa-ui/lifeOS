// Anclar algo al borde inferior del viewport VISUAL, que en iOS no es el de
// layout.
//
// EL PROBLEMA, EN UNA FRASE
// En Safari de iOS el teclado NO encoge el viewport de layout: sólo desplaza el
// visual por encima. Como `position: fixed; bottom: 0` se mide contra el de
// LAYOUT, la barra queda anclada por debajo del teclado —invisible— y al hacer
// scroll el visual se desliza sobre el de layout y la barra parece derivar.
// Los dos síntomas que se reportaron son el mismo error: mezclar coordenadas.
//
// LA SALIDA
// Anclar desde ARRIBA (`top: 0`) y desplazar con `transform` hasta el borde
// inferior del viewport visual, todo en coordenadas de layout. Un solo sistema.
//
// Un intento anterior quitó `vvOffsetTop` de la fórmula porque «cambiaba al
// hacer scroll». Cambiar al hacer scroll es justo lo que tiene que hacer: es el
// término que mantiene la barra pegada al viewport visual. Lo que estaba mal
// era anclar por `bottom`.

/** Por debajo de esto no hay teclado, sino la barra de direcciones de Safari
 *  apareciendo y desapareciendo. Sin umbral, la barra daría saltitos. */
export const ANCLAJE_MINIMO_TECLADO = 60;

export interface MedidasViewport {
  /** Alto del viewport de LAYOUT (`window.innerHeight`). */
  innerHeight: number;
  /** Alto del viewport VISUAL (`visualViewport.height`). */
  vvHeight: number;
  /** Desplazamiento del visual dentro del de layout (`visualViewport.offsetTop`). */
  vvOffsetTop: number;
}

/**
 * Coordenada Y del borde inferior del viewport visual, medida en el viewport de
 * layout — que es el sistema en el que vive un elemento `position: fixed`.
 *
 * Se usa como `transform: translateY(calc(Ypx - 100%))` sobre un elemento
 * anclado a `top: 0`: su borde inferior cae exactamente ahí.
 *
 * Devuelve `null` cuando no hay teclado: entonces no hay nada que compensar y
 * un `bottom: 0` normal es más estable que cualquier cálculo.
 */
export function bordeInferiorVisual({
  innerHeight,
  vvHeight,
  vvOffsetTop
}: MedidasViewport): number | null {
  const teclado = innerHeight - vvHeight;
  // SIN TECLADO NO SE CALCULA NADA, y esto es lo que arregla el «se mueve al
  // hacer scroll»: en iOS `window.innerHeight` NO es constante — crece cuando
  // la barra de direcciones de Safari se encoge al desplazarse. Devolverlo
  // como posición hacía que la barra siguiera ese cambio. Con `null`, el
  // componente se queda con el `bottom: 0` del CSS, que va anclado al viewport
  // de layout y no se inmuta con el scroll.
  if (teclado <= ANCLAJE_MINIMO_TECLADO) return null;

  const borde = vvOffsetTop + vvHeight;
  // Nunca fuera de la pantalla, pase lo que pase con las medidas.
  return Math.max(0, Math.min(innerHeight, Math.round(borde)));
}
