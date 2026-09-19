// src/lib/domain/ritual/decidir.ts
// La puerta del arranque guiado (D-165), probada en
// tests/domain/ritual-decidir.test.ts.

import { routineDueToday } from "../development/routines.ts";
import type { RitualSettings } from "./types.ts";

export type MotivoOmision =
  | "politica_apagada"
  | "usuario_apagado"
  | "fuera_de_ventana"
  | "no_toca_hoy"
  | "ya_visto"
  | "sin_contenido";

export interface EntradaDecision {
  settings: RitualSettings;
  /** De `todayForUser()`. Jamás de `new Date()` del proceso: en Vercel es UTC. */
  dateISO: string;
  /** De `hourInTimeZone(profiles.timezone)`, por la misma razón. */
  hourLocal: number;
  yaHayEjecucionHoy: boolean;
  /** Si la secuencia construida tiene algo más que saludo y cierre. */
  hayContenido: boolean;
}

/**
 * `[inicio, fin)`, como todos los rangos del repo. Las 12:00 con `windowEnd=12`
 * ya está fuera: si fuera inclusivo, una ventana «de 4 a 12» duraría hasta las
 * 12:59 y nadie lo esperaría al leerla.
 */
export function dentroDeVentana(hourLocal: number, start: number, end: number): boolean {
  return hourLocal >= start && hourLocal < end;
}

/**
 * ¿Se muestra hoy el arranque, y si no, por qué?
 *
 * EL MOTIVO ES EL PRIMERO QUE APLICA, y el orden no es casual: va de lo más de
 * fondo a lo más de superficie. Con la política apagada y además fuera de hora,
 * contestar «fuera de ventana» mandaría al administrador a cambiar el horario
 * de algo que ni siquiera está encendido.
 *
 * Devolver el motivo —y no solo un booleano— es lo que hace que esta función
 * sirva para depurar. Sin él, «no aparece el ritual» es un misterio que se
 * resuelve leyendo código.
 */
export function debeMostrarseHoy(e: EntradaDecision): { mostrar: boolean; motivo: MotivoOmision | null } {
  const { settings } = e;

  if (!settings.enabled) return { mostrar: false, motivo: "politica_apagada" };
  // `routineDueToday` y no un calendario propio: un solo sitio en el repo
  // decide qué es «entre semana», y es el que ya usan las rutinas.
  if (!routineDueToday(settings.frequency, e.dateISO)) return { mostrar: false, motivo: "no_toca_hoy" };
  if (!dentroDeVentana(e.hourLocal, settings.windowStart, settings.windowEnd)) {
    return { mostrar: false, motivo: "fuera_de_ventana" };
  }
  // Antes que `sin_contenido` a propósito: si ya se vio, no hay que construir
  // la secuencia para averiguar si valía la pena.
  if (e.yaHayEjecucionHoy) return { mostrar: false, motivo: "ya_visto" };
  if (settings.steps.length === 0 || !e.hayContenido) return { mostrar: false, motivo: "sin_contenido" };

  return { mostrar: true, motivo: null };
}
