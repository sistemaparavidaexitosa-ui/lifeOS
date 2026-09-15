// src/lib/domain/identity/schedule.ts
// Cuándo se toma la foto nocturna del Identity Score (probado en
// tests/domain/identity-schedule.test.ts).

/**
 * La foto va en la última hora del día local, de 23:00 a 23:59: lo más cerca
 * posible del cierre, para que recoja lo que se marcó por la noche, y con doce
 * pasadas del reloj (cada cinco minutos) de margen por si alguna falla. Después
 * de medianoche ya es otro día y la foto de ayer no se toma: un hueco en la
 * curva es honesto; una foto de «ayer» calculada con datos de hoy, no.
 */
export const HORA_FOTO_IDENTIDAD = 23;

export function tocaFotoDeIdentidad(horaLocal: string): boolean {
  return Number(horaLocal.slice(0, 2)) === HORA_FOTO_IDENTIDAD;
}
