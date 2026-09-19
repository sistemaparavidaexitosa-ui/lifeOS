// src/lib/dom/ritual-focus.ts
// La trampa de foco del arranque guiado (D-165).
//
// POR QUÉ ESTO VIVE FUERA DEL COMPONENTE
// Por la misma razón que `linea-dom.ts`: `node --experimental-strip-types` no
// procesa JSX, así que nada dentro de un .tsx tiene pruebas. Y una trampa de
// foco rota no se nota mirando la pantalla — se nota con el teclado, que es
// exactamente lo que nadie prueba a mano. El repo no añade Testing Library
// (D-008), así que la mecánica se saca aquí y se prueba en jsdom.
//
// NO COMPRUEBA VISIBILIDAD REAL. `offsetParent` y `getClientRects()` devuelven
// siempre lo mismo en jsdom, así que una comprobación basada en ellos sería
// código sin prueba que además no haría falta: el overlay pinta sus propios
// controles y no esconde ninguno con CSS.

/** Lo que cuenta como enfocable dentro del overlay, en orden de documento. */
const SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]"
].join(",");

function esEnfocable(el: HTMLElement): boolean {
  if (el.hasAttribute("disabled")) return false;
  if (el.hasAttribute("hidden")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  // Un input oculto es un campo de formulario, no algo que se pueda enfocar.
  //
  // Se mira la ETIQUETA y el ATRIBUTO, no `instanceof HTMLInputElement`: ese
  // `instanceof` depende del global del realm en que corra el código, y falla
  // tanto en jsdom como dentro de un iframe. Un módulo del DOM que solo
  // funciona en el realm principal es un módulo que no se puede probar.
  if (el.tagName === "INPUT" && el.getAttribute("type") === "hidden") return false;
  // `tabindex="-1"` es enfocable por código pero NO por teclado: está fuera del
  // ciclo a propósito, y meterlo aquí lo devolvería al recorrido.
  const tabindex = el.getAttribute("tabindex");
  if (tabindex !== null && Number(tabindex) < 0) return false;
  return true;
}

/** Los elementos del contenedor que participan en el recorrido con Tab. */
export function focosDe(contenedor: HTMLElement): HTMLElement[] {
  return Array.from(contenedor.querySelectorAll<HTMLElement>(SELECTOR)).filter(esEnfocable);
}

/**
 * Mantiene el Tab dentro del overlay.
 *
 * Solo interviene en los dos bordes —y cuando el foco se ha escapado fuera del
 * contenedor, que pasa de verdad: el overlay monta y el foco sigue en el
 * `<body>` o en el botón que había debajo—. En medio de la lista NO se toca
 * nada: el orden natural del navegador ya es el correcto, y reimplementarlo a
 * mano es como se rompen los lectores de pantalla.
 */
export function atraparFoco(contenedor: HTMLElement, evento: KeyboardEvent): void {
  if (evento.key !== "Tab") return;

  const focos = focosDe(contenedor);
  if (focos.length === 0) return;

  const primero = focos[0] as HTMLElement;
  const ultimo = focos[focos.length - 1] as HTMLElement;
  const activo = contenedor.ownerDocument.activeElement;

  if (activo === null || !contenedor.contains(activo)) {
    (evento.shiftKey ? ultimo : primero).focus();
    evento.preventDefault();
    return;
  }

  if (evento.shiftKey && activo === primero) {
    ultimo.focus();
    evento.preventDefault();
    return;
  }

  if (!evento.shiftKey && activo === ultimo) {
    primero.focus();
    evento.preventDefault();
  }
}

/**
 * Lleva el foco al overlay y devuelve la función que lo repone donde estaba.
 *
 * PREFIERE EL TÍTULO, marcado con `data-ritual-title`. El primer elemento
 * enfocable de la capa suele ser «Ahora no», y empezar ahí le lee a un lector de
 * pantalla la salida antes que el contenido — el ritual se presentaría a sí
 * mismo como algo de lo que salir.
 *
 * Reponer el foco al cerrar no es un detalle: sin ello, quien navega con teclado
 * vuelve al principio del documento y tiene que recorrer la aplicación entera
 * para llegar a donde estaba.
 */
export function abrirFoco(contenedor: HTMLElement): () => void {
  const doc = contenedor.ownerDocument;
  const anterior = doc.activeElement;

  const titulo = contenedor.querySelector<HTMLElement>("[data-ritual-title]");
  const destino = titulo ?? focosDe(contenedor)[0] ?? null;
  destino?.focus();

  return () => {
    // Mismo motivo que arriba: se comprueba que sepa recibir el foco, no de qué
    // clase es. `anterior` puede ser el `<body>`, que no lo necesita.
    const previo = anterior as { focus?: () => void } | null;
    if (typeof previo?.focus === "function") previo.focus();
  };
}
