// src/lib/domain/ritual/tema.ts
// El tema del arranque guiado (D-165). Puro, probado en
// tests/domain/ritual-tema.test.ts.

/** A partir de esta hora local, el ritual se pinta invertido. */
export const INICIO_NOCHE = 19;
/** A partir de esta hora local, vuelve a ser de día. */
export const FIN_NOCHE = 7;

export type TemaRitual = "claro" | "oscuro";

/**
 * Blanco con texto negro de día; invertido de noche.
 *
 * LA DECIDE LA HORA LOCAL DEL PERFIL —la misma que `todayForUser()`— y no
 * `prefers-color-scheme`. Con la preferencia del sistema, un portátil en modo
 * oscuro daría un ritual negro a mediodía, que es exactamente lo contrario de
 * lo que se pidió. Tampoco el `data-theme` del `<html>`: el ritual es una sala
 * aparte y la app de debajo conserva el suyo.
 *
 * Una hora fuera de rango cae a "claro" en vez de lanzar: el valor llega desde
 * el servidor por props, y una pantalla en blanco por un número raro sería peor
 * que un tema por defecto.
 */
export function temaDelRitual(horaLocal: number): TemaRitual {
  if (!Number.isInteger(horaLocal) || horaLocal < 0 || horaLocal > 23) return "claro";
  return horaLocal >= INICIO_NOCHE || horaLocal < FIN_NOCHE ? "oscuro" : "claro";
}
