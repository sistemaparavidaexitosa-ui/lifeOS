export function money(n: number, currency = "MXN", locale = "es-MX", maximumFractionDigits = 2): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits }).format(n || 0);
  } catch {
    return `${(n || 0).toFixed(maximumFractionDigits)} ${currency}`;
  }
}

export function money0(n: number, currency = "MXN", locale = "es-MX"): string {
  return money(n, currency, locale, 0);
}

/** `2026-08-31` sí; `2026-08-31T12:00:00Z` no. */
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fecha de calendario, sin hora.
 *
 * EL DÍA DE MENOS (2026-09-01)
 * `new Date("2026-08-31")` se interpreta como medianoche UTC, e Intl lo
 * formateaba en la zona del PROCESO. En México (UTC-6) esa medianoche son las
 * 18:00 del día anterior, así que un `2026-08-31` guardado en una columna
 * `date` se pintaba como "30 ago 2026". Afectaba a todo lo que es fecha pura y
 * no instante: vencimientos de tareas, horizontes de metas, cortes de reporte,
 * la fecha estimada de término de un libro y las semanas del plan de lectura
 * (donde saltó: una semana anclada al lunes se anunciaba empezando en domingo).
 *
 * Una fecha de calendario no tiene zona horaria: el 31 de agosto es el 31 de
 * agosto en Tijuana y en Madrid. Por eso se formatea en UTC, que es como se
 * guardó. Un instante completo (`...T12:00:00Z`) sí tiene zona y conserva el
 * comportamiento de siempre — ahí el día local es la respuesta correcta.
 */
export function fdate(iso: string | null | undefined, locale = "es-MX"): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(SOLO_FECHA.test(iso) ? { timeZone: "UTC" } : {})
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Fecha con hora, para lo que cambia varias veces al día.
 *
 * `fdate` sirve para una fecha meta o un vencimiento, donde la hora sobra. En
 * una nota compartida no: saber que alguien la tocó "hoy" no dice si fue antes
 * o después de que tú la leyeras.
 */
export function fdatetime(iso: string | null | undefined, locale = "es-MX"): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
