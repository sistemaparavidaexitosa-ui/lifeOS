/**
 * El aviso que la tarjeta de Home le manda al anfitrión del centro (D-166).
 *
 * Vive en su propio archivo para que los dos lados dependan del mismo nombre y
 * no de una cadena escrita a mano en cada uno. Un evento mal escrito no falla:
 * simplemente no pasa nada, que es el peor modo de fallar.
 */
export const EVENTO_ABRIR_CENTRO = "lifeos:abrir-centro";

/**
 * Abrir el Centro desde cualquier sitio (rediseño: el objetivo de la barra
 * inferior). El anfitrión llega en streaming tras un límite de Suspense: un
 * toque antes de que monte se perdía. Se deja la petición PENDIENTE y el
 * anfitrión la recoge al montar.
 */
export function pedirAbrirCentro() {
  (window as unknown as { __abrirCentroPendiente?: boolean }).__abrirCentroPendiente = true;
  window.dispatchEvent(new Event(EVENTO_ABRIR_CENTRO));
}

/** `true` (y la consume) si alguien pidió abrir el Centro antes de que el anfitrión montara. */
export function tomarPeticionPendiente(): boolean {
  const w = window as unknown as { __abrirCentroPendiente?: boolean };
  const habia = Boolean(w.__abrirCentroPendiente);
  w.__abrirCentroPendiente = false;
  return habia;
}
