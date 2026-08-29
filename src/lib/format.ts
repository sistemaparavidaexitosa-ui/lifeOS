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

export function fdate(iso: string | null | undefined, locale = "es-MX"): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
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
