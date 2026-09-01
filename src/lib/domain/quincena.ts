// Quincenas de calendario — lógica pura, sin dependencias de Next/React/Supabase
// (probada en tests/domain/quincena.test.ts).
//
// POR QUÉ EXISTE ESTE MÓDULO
// Money OS presupuesta por quincena (`budgets.q1_amount` / `q2_amount`) porque al
// usuario le pagan por quincena, pero hasta ahora el código no tenía el concepto:
// el "ciclo vigente" era una ventana RODANTE de 15 días (`hoy − 15`). Esa ventana
// se desplaza cada día, pisa el final de Q1 y el principio de Q2 y nunca se
// reinicia el día de pago, así que el gasto que se veía era un acumulado que
// mezclaba las dos quincenas y jamás se comparaba contra la aportación de la
// quincena en curso.
//
// Aquí la quincena es un PERIODO CERRADO con fronteras fijas (D-076):
//   Q1 = día 1 al 15,  Q2 = día 16 al último día del mes.
// Q1 + Q2 = mes natural exacto, de modo que el resumen mensual sigue cuadrando.
//
// La aritmética va sobre `Date.UTC` (mismo estilo que addDaysISO en datetime.ts):
// nunca `new Date()` sin zona. El "hoy" del usuario se obtiene con
// getUserTimeZone() + todayLocal() y se pasa como argumento.

export interface Quincena {
  /** Clave estable "YYYY-MM-Q1|Q2": se persiste y viaja en la URL. */
  key: string;
  year: number;
  /** 1-12. */
  month: number;
  half: 1 | 2;
  /** Primer día del periodo, ISO yyyy-mm-dd (inclusivo). */
  fromISO: string;
  /** Último día del periodo, ISO yyyy-mm-dd (inclusivo). */
  toISO: string;
  /** Etiqueta corta para el encabezado: "Quincena 2 · 16–31 ago". */
  label: string;
}

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Último día del mes (28/29/30/31). Day 0 del mes siguiente en UTC. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function build(year: number, month: number, half: 1 | 2): Quincena {
  const lastDay = daysInMonth(year, month);
  const fromDay = half === 1 ? 1 : 16;
  const toDay = half === 1 ? 15 : lastDay;
  return {
    key: `${year}-${pad(month)}-Q${half}`,
    year,
    month,
    half,
    fromISO: `${year}-${pad(month)}-${pad(fromDay)}`,
    toISO: `${year}-${pad(month)}-${pad(toDay)}`,
    label: `Quincena ${half} · ${fromDay}–${toDay} ${MONTHS_SHORT[month - 1]}`
  };
}

/** La quincena que contiene una fecha ISO (yyyy-mm-dd). */
export function quincenaFor(dateISO: string): Quincena {
  const year = Number(dateISO.slice(0, 4));
  const month = Number(dateISO.slice(5, 7));
  const day = Number(dateISO.slice(8, 10));
  return build(year, month, day <= 15 ? 1 : 2);
}

/**
 * Reconstruye una quincena desde su clave. Devuelve `null` —no lanza— porque la
 * clave llega del querystring (`/money/budget?q=…`) y un valor manipulado no
 * debe tumbar la página: el caller cae a la quincena vigente.
 */
export function quincenaFromKey(key: string): Quincena | null {
  const m = /^(\d{4})-(\d{2})-Q([12])$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return build(year, month, Number(m[3]) as 1 | 2);
}

/** Mueve `delta` quincenas (±1 = anterior/siguiente), cruzando mes y año. */
export function shiftQuincena(q: Quincena, delta: number): Quincena {
  // Índice absoluto de medias-mensualidades desde el año 0: evita casos
  // especiales de fin de mes y de fin de año.
  const index = (q.year * 12 + (q.month - 1)) * 2 + (q.half - 1) + delta;
  const half = ((index % 2) + 2) % 2;
  const monthIndex = Math.floor(index / 2);
  return build(Math.floor(monthIndex / 12), (monthIndex % 12) + 1, (half + 1) as 1 | 2);
}

/** Mes natural que contiene la quincena — la ventana del resumen mensual. */
export function monthRangeOf(q: Quincena): { fromISO: string; toISO: string } {
  return {
    fromISO: `${q.year}-${pad(q.month)}-01`,
    toISO: `${q.year}-${pad(q.month)}-${pad(daysInMonth(q.year, q.month))}`
  };
}
