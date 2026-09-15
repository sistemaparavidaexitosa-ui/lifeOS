// Formatos compartidos por las gráficas. Las fechas son de calendario, así que
// se formatean en UTC (ver `fdate` en lib/format.ts): el 15 de septiembre es
// el 15 de septiembre en cualquier zona.

const DIA_CORTO = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
const DIA_LARGO = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const MES = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });

/** «15 sep» */
export function diaCorto(iso: string): string {
  return DIA_CORTO.format(new Date(`${iso}T00:00:00Z`)).replace(".", "");
}

/** «martes, 15 de septiembre» */
export function diaLargo(iso: string): string {
  return DIA_LARGO.format(new Date(`${iso}T00:00:00Z`));
}

/** «Septiembre de 2026». Solo la inicial: `text-transform: capitalize` pondría «De». */
export function nombreMes(yearMonth: string): string {
  const texto = MES.format(new Date(`${yearMonth}-01T00:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** «72 %», o «—» si no hay nada que medir. */
export function pct(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${n} %`;
}

/** «+6», «−4», «0», o «—». El signo menos es el tipográfico. */
export function puntos(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}
