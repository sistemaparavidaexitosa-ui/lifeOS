// La selección: qué nodos están marcados y qué hace cada gesto.
//
// POR QUÉ ESTO ES DOMINIO Y NO ESTADO DEL COMPONENTE
// Porque son reglas, no estado. «Mayúsculas añade, Alt quita, sin nada
// reemplaza» es un contrato que la gente ya conoce de otras herramientas y que
// se rompe en cuanto se escribe a mano dentro de un manejador de eventos entre
// otras quince cosas. Aquí son cuatro funciones que se prueban con dos líneas.

export type SelectionMode = "replace" | "add" | "toggle" | "subtract";

/**
 * Qué gesto es, a partir de las teclas.
 *
 * `metaKey` va junto a `ctrlKey` porque en un Mac la tecla de sistema es Cmd y
 * en Windows es Ctrl, y nadie debería tener que pensarlo.
 */
export function modeFromEvent(e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): SelectionMode {
  if (e.altKey) return "subtract";
  if (e.ctrlKey || e.metaKey) return "toggle";
  if (e.shiftKey) return "add";
  return "replace";
}

export function applySelection(
  current: ReadonlySet<string>,
  hit: readonly string[],
  mode: SelectionMode
): Set<string> {
  if (mode === "replace") return new Set(hit);
  const next = new Set(current);
  for (const id of hit) {
    if (mode === "add") next.add(id);
    else if (mode === "subtract") next.delete(id);
    else if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return next;
}

/**
 * El rectángulo de un arrastre, normalizado.
 *
 * Sin normalizar, arrastrar de derecha a izquierda da anchura negativa y no
 * selecciona nada, que es el error que tiene toda selección por rectángulo
 * escrita a la primera.
 */
export function marquee(a: { x: number; y: number }, b: { x: number; y: number }) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}

/** Un arrastre de menos de cuatro píxeles es un clic con pulso, no una selección. */
export const UMBRAL_ARRASTRE = 4;

export function esArrastre(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) >= UMBRAL_ARRASTRE || Math.abs(a.y - b.y) >= UMBRAL_ARRASTRE;
}

/**
 * Qué gesto empieza al apoyar el puntero.
 *
 * POR QUÉ ESTO ES DOMINIO Y NO UN `if` DENTRO DEL MANEJADOR
 * Porque se envió mal y no había forma de comprobarlo sin un teléfono. El
 * lienzo salió sin un solo gesto táctil: desplazarse exigía botón central o
 * barra espaciadora —en un móvil no existe ninguno de los dos— y arrastrar con
 * un dedo dibujaba un rectángulo de selección, así que el grafo era literalmente
 * inmovible. Aquí la decisión es una tabla que se prueba con `node --test`.
 *
 * LA REGLA QUE ORDENA LA TABLA: el dedo y el ratón NO son el mismo dispositivo.
 * Con ratón hay tres formas de desplazarse (botón central, barra espaciadora,
 * rueda), así que el arrastre queda libre para seleccionar. Con un dedo solo
 * hay una mano, y lo que todo el mundo espera de arrastrar sobre un lienzo es
 * moverlo — es lo que hace cualquier mapa desde hace quince años—. El
 * rectángulo de selección se pierde en táctil, y es un precio barato: se
 * selecciona tocando, y para varios nodos se toca uno a uno.
 *
 * Un lápiz cuenta como ratón: tiene precisión de puntero y quitarle el
 * rectángulo sería quitarle una herramienta sin motivo.
 */
export type Gesture = "pan" | "node" | "marquee" | "pinch";

export interface GestureInput {
  pointerType: "mouse" | "touch" | "pen" | string;
  button: number;
  spaceHeld: boolean;
  onNode: boolean;
  /** Cuántos punteros hay apoyados a la vez, contando este. */
  activePointers: number;
}

export function gestureFor(input: GestureInput): Gesture {
  // Dos dedos son pellizco pase lo que pase. Comprobarlo PRIMERO evita el caso
  // feo: apoyar el segundo dedo encima de un nodo y empezar a arrastrarlo en
  // mitad de un zoom.
  if (input.activePointers >= 2) return "pinch";

  // El botón central y la barra espaciadora mandan sobre lo que haya debajo:
  // si no, en una zona densa siempre habría un nodo bajo el cursor y no habría
  // manera de desplazar el lienzo desde ahí.
  if (input.button === 1 || input.spaceHeld) return "pan";

  if (input.onNode) return "node";

  return input.pointerType === "touch" ? "pan" : "marquee";
}
