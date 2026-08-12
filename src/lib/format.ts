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
