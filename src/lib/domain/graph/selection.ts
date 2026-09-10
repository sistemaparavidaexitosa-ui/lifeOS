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
