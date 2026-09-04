// Fecha y hora en la ZONA HORARIA DEL USUARIO — lógica pura, sin dependencias
// de Next/React/Supabase (probada en tests/domain/datetime.test.ts).
//
// POR QUÉ EXISTE ESTE MÓDULO
// Hasta ahora `todayLocal()` (src/lib/data/dates.ts) usaba la zona horaria
// del PROCESO. En desarrollo eso funciona (tu laptop está en México), pero en
// Vercel el servidor corre en UTC, así que entre las 18:00 y la medianoche
// hora de México el servidor ya creía que era el día siguiente. Consecuencias
// reales, no cosméticas:
//   - marcar un hábito a las 8 pm lo registraba en la fecha de mañana;
//   - el plan diario de /planning se guardaba en `local_date` de mañana;
//   - los rangos de /reports y /money se corrían un día;
//   - el saludo de /home decía "Buenas noches" a la 1 de la tarde.
//
// `profiles.timezone` ya existía desde la migración 0002 (default
// 'America/Mexico_City') y nadie lo usaba para calcular. Estas funciones lo
// usan; el resto de la app las llama vía getUserTimeZone() (src/lib/data/profile.ts).

export const DEFAULT_TIMEZONE = "America/Mexico_City";

/**
 * `profiles.timezone` es un campo de texto libre editable en /settings, así
 * que un valor inválido llegaría hasta el render. Intl lanza RangeError con
 * una zona desconocida: se valida antes para no tumbar la página entera por
 * un typo (y settings/onboarding lo rechazan al guardar).
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function safeZone(timeZone: string | null | undefined): string {
  if (timeZone && isValidTimeZone(timeZone)) return timeZone;
  return isValidTimeZone(DEFAULT_TIMEZONE) ? DEFAULT_TIMEZONE : "UTC";
}

/** Partes de fecha/hora del instante `now` vistas desde `timeZone`. */
function partsIn(timeZone: string, now: Date): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
}

/** Fecha ISO (yyyy-mm-dd) del "hoy" del usuario, no del servidor. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const p = partsIn(timeZone, now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hora (0-23) del usuario. Para saludos y para "¿ya pasó la hora de X?". */
export function hourInTimeZone(timeZone: string, now: Date = new Date()): number {
  const p = partsIn(timeZone, now);
  // Intl con hour12:false devuelve "24" a la medianoche en algunos entornos.
  return Number(p.hour) % 24;
}

/**
 * Hora local en «HH:MM». La necesita el despachador de notificaciones para
 * decidir si ya pasó la hora de un recordatorio, donde los minutos importan:
 * con `hourInTimeZone` a secas, «recuérdamelo a las 15:30» sonaría a las 15:00.
 */
export function timeInTimeZone(timeZone: string, now: Date = new Date()): string {
  const p = partsIn(timeZone, now);
  // El `% 24` de hourInTimeZone existe porque Intl devuelve "24" a medianoche
  // en algunos entornos; aquí hace la misma falta.
  return `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`;
}

/** Saludo según la hora REAL del usuario. */
export function greetingFor(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Días calendario entre dos fechas ISO (b - a). Negativo = b antes que a. */
export function diffDays(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
}

/**
 * Lunes de la semana que contiene `iso`.
 *
 * El lunes es el ancla de semana de TODO el OS y no una preferencia de este
 * módulo: `routineDueToday("Semanal")` lo usa para decidir si una rutina toca
 * hoy, /planning arranca la semana ahí, y la cola de lectura (migración 0043)
 * lo impone con un `check` en la columna. Una sola función para que no acaben
 * conviviendo dos criterios de "qué semana es esta".
 */
export function weekStartISO(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = domingo
  // El domingo pertenece a la semana que EMPEZÓ el lunes anterior, seis días
  // atrás — no al lunes siguiente.
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}
