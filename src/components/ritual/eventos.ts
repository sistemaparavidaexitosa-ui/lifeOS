/**
 * El aviso que la tarjeta de Home le manda al anfitrión del centro (D-166).
 *
 * Vive en su propio archivo para que los dos lados dependan del mismo nombre y
 * no de una cadena escrita a mano en cada uno. Un evento mal escrito no falla:
 * simplemente no pasa nada, que es el peor modo de fallar.
 */
export const EVENTO_ABRIR_CENTRO = "lifeos:abrir-centro";
