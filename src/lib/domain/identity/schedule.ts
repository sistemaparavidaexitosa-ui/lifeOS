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

/**
 * A qué hora local se escribe el brief del día, ANTES de que nadie lo pida.
 *
 * LAS CUATRO DE LA MAÑANA, y cada parte del número tiene su motivo:
 *
 *  - **Después de medianoche**, porque el brief es de HOY y antes de las 00:00
 *    la fecha local todavía es la de ayer.
 *  - **Antes de que nadie madrugue.** Quien se levanta a las cinco ya se lo
 *    encuentra escrito, que es el objetivo entero.
 *  - **En la parte muerta del reloj.** A esta hora no corren ni el coach, ni la
 *    foto de identidad (23:00), ni los insights nocturnos, así que el trabajo
 *    que llama al modelo tiene el presupuesto de la pasada para él solo.
 *
 * Igual que la foto, ocupa la hora entera: doce pasadas del reloj de margen por
 * si alguna falla o el agente tarda en despertar.
 */
export const HORA_BRIEF_DEL_DIA = 4;

export function tocaBriefDelDia(horaLocal: string): boolean {
  return Number(horaLocal.slice(0, 2)) === HORA_BRIEF_DEL_DIA;
}

/** La guarda de `ai_job_runs`: un intento por persona y día, pase lo que pase. */
export const JOB_BRIEF_DEL_DIA = "identity.brief";
