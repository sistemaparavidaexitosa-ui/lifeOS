// Dónde va la barra de formato del editor de notas (D-155).
//
// POR QUÉ SE ANCLA A LA LÍNEA Y NO A LA PANTALLA
// Cuatro intentos la ataron a la pantalla y los cuatro fallaron en el iPhone:
// tres anclándola sobre el teclado con `visualViewport` (D-113) y uno pegándola
// arriba con `position: sticky` (D-154). Con el teclado abierto, Safari no encoge
// el viewport de layout: desplaza el visual por encima, y todo lo que se mide
// contra la pantalla —fijo, pegado o calculado— acaba fuera de la vista.
//
// Así que la barra va justo DEBAJO de la línea donde se escribe, en el hueco
// que esa línea reserva (`.nb-line.con-barra`), y en coordenadas del
// contenedor: la resta de dos cajas que se mueven juntas no cambia con el
// scroll, con el teclado ni con la barra de direcciones.
//
// Debajo y no encima: encima tapaba la línea anterior —no se podía tocar— y
// chocaba con el menú de iOS (Copiar, Formato…), que sale sobre la selección.

export interface Caja {
  top: number;
  bottom: number;
}

const RESPIRO = 6;

/** `top` de la barra, relativo al contenedor. */
export function posicionBarra(linea: Caja, contenedor: { top: number }): number {
  return Math.round(linea.bottom - contenedor.top + RESPIRO);
}
