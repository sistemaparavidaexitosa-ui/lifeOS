// src/lib/domain/centro/franja.ts
// Las tres franjas del día del centro agéntico (D-167). Puro, probado en
// tests/domain/centro-franja.test.ts.

export const FRANJAS = ["manana", "tarde", "noche"] as const;
export type Franja = (typeof FRANJAS)[number];

/**
 * En qué franja cae una hora local.
 *
 * Las franjas son lo que limita el gasto: el centro piensa UNA vez en cada una,
 * así que como mucho tres veces al día. No hay huecos ni solapes —hay una
 * prueba que recorre las 24 horas— porque una hora sin franja sería una hora sin
 * sugerencias y sin ningún motivo que lo explique.
 *
 * El corte de las 19:00 es el mismo que usa el tema nocturno del ritual
 * (`INICIO_NOCHE`): si la pantalla se pone oscura, ya es de noche también para
 * lo que el centro tenga que decir.
 *
 * Una hora fuera de rango cae a «mañana» en vez de lanzar: viene de
 * `hourInTimeZone`, pero llega por props, y una pantalla en blanco por un número
 * raro sería peor que una franja por defecto.
 */
export function franjaDeHoy(horaLocal: number): Franja {
  if (!Number.isInteger(horaLocal) || horaLocal < 0 || horaLocal > 23) return "manana";
  if (horaLocal < 12) return "manana";
  return horaLocal < 19 ? "tarde" : "noche";
}
