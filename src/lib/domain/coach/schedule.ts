// src/lib/domain/coach/schedule.ts
// Cuándo le toca hablar al coach — lógica pura: sin Supabase, sin red, sin
// `new Date()`. La hora local y el día local entran como parámetros, igual que
// en `domain/push/schedule.ts` (D-016/D-018).

export type Momento = "morning" | "night";

export interface PrefsCoach {
  enabled: boolean;
  morningHour: number;
  nightHour: number;
}

/** Sin fila de preferencias = todo encendido, con las horas de 0053. */
export const PREFS_POR_DEFECTO: PrefsCoach = { enabled: true, morningHour: 7, nightHour: 21 };

/**
 * CUÁNTAS HORAS DESPUÉS SIGUE VALIENDO LA PENA.
 *
 * El reloj pasa cada cinco minutos, así que lo normal es acertar la hora en
 * punto. Esto NO es para eso: es para cuando el reloj no pasó —un despliegue,
 * una caída, la cuota del modelo agotada—. Con una comparación exacta, un
 * mensaje perdido se pierde para siempre; con un `>=` a secas, alguien que abre
 * la app a las once de la noche recibiría el «buenos días» de esa mañana, que
 * es peor que no recibirlo.
 *
 * Tres horas: el margen que hace que «se recuperó» siga siendo verdad.
 */
export const VENTANA_HORAS = 3;

function horaDe(horaLocal: string): number {
  return Number(horaLocal.slice(0, 2));
}

function dentroDeVentana(hora: number, objetivo: number): boolean {
  return hora >= objetivo && hora < objetivo + VENTANA_HORAS;
}

/**
 * Qué mensaje toca AHORA, o `null`.
 *
 * Cuando los dos caben —porque alguien puso la mañana a las 20 y la noche a las
 * 21— gana el de la noche: es el más reciente, y el de la mañana ya no tiene
 * nada que aportar a un día que terminó.
 *
 * Quien llama comprueba después que ese mensaje no se haya mandado ya hoy; eso
 * no se decide aquí porque depende de la base (`dedupe_key`), y esta función
 * tiene que poder probarse sin ella.
 */
export function momentoQueToca(horaLocal: string, prefs: PrefsCoach = PREFS_POR_DEFECTO): Momento | null {
  if (!prefs.enabled) return null;
  const hora = horaDe(horaLocal);
  if (Number.isNaN(hora)) return null;

  if (dentroDeVentana(hora, prefs.nightHour)) return "night";
  if (dentroDeVentana(hora, prefs.morningHour)) return "morning";
  return null;
}

/**
 * La clave de idempotencia. La fecha local va DENTRO: es lo que hace que las
 * doce pasadas de una hora produzcan un solo mensaje, y que mañana produzcan
 * otro.
 */
export function claveDelCoach(momento: Momento, fechaLocalISO: string): string {
  return `coach:${momento}:${fechaLocalISO}`;
}
