// Capa de datos para fechas. La lógica pura vive en src/lib/domain/datetime.ts;
// aquí solo se re-exporta lo que el resto de la app ya importaba.
//
// `todayLocal()` YA NO existe sin argumentos a propósito: usaba la zona
// horaria del proceso (UTC en Vercel) y corría el día del usuario. Ahora todo
// call-site debe pasar la zona del perfil — la obtienes con getUserTimeZone()
// de src/lib/data/profile.ts.
//
// Si lo único que quieres es «hoy» para quien mira la pantalla, no compongas
// las dos a mano: usa `todayForUser()` de src/lib/data/profile.ts, que es
// exactamente eso y deja un solo sitio donde D-016 puede romperse.
export {
  DEFAULT_TIMEZONE,
  addDaysISO,
  diffDays,
  greetingFor,
  hourInTimeZone,
  isValidTimeZone,
  timeInTimeZone,
  todayInTimeZone,
  weekStartISO
} from "@/lib/domain/datetime.ts";

import { todayInTimeZone } from "@/lib/domain/datetime.ts";

/** Fecha ISO (yyyy-mm-dd) de hoy en la zona horaria del usuario. */
export function todayLocal(timeZone: string): string {
  return todayInTimeZone(timeZone);
}
