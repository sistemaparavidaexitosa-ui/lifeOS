// src/lib/domain/money/watchlist.ts
// El vocabulario de la watchlist (D-184) — puro, probado en
// tests/domain/money-watchlist.test.ts.
//
// Aquí no se piden precios ni se habla con Polygon: eso es
// `src/lib/money/polygon.ts`. Esto es lo que se puede decidir sin red, que es
// más de lo que parece — y es justo lo que hay que poder probar sin una llave.

/**
 * Un ticker, o `null` si eso no es un ticker.
 *
 * Mayúsculas, empieza por letra, admite punto y guion —`BRK.B`, `RDS-A`— y
 * hasta doce caracteres. El mismo patrón está en el `check` de la migración
 * 0073: la base rechaza por su cuenta lo que esta función no dejaría pasar, por
 * si algún día alguien inserta por otra vía.
 */
export function normalizarTicker(crudo: string): string | null {
  const t = crudo.trim().toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,11}$/.test(t) ? t : null;
}

export type TonoDeVariacion = "ok" | "bad" | "info";

export interface Variacion {
  /** Con signo, redondeado a dos decimales. */
  pct: number;
  tono: TonoDeVariacion;
  /** Listo para pintar: «+1.24%». */
  texto: string;
}

/**
 * El umbral de «plano».
 *
 * Existe porque un 0.03% pintado en verde es ruido con aspecto de señal: el ojo
 * lee color antes que número, y en una lista de diez tickers eso son diez
 * señales falsas cada mañana.
 */
const PLANO = 0.1;

export function variacion(pct: number | null | undefined): Variacion | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  const redondeado = Math.round(pct * 100) / 100;
  const tono: TonoDeVariacion = Math.abs(redondeado) < PLANO ? "info" : redondeado > 0 ? "ok" : "bad";
  const signo = redondeado > 0 ? "+" : "";
  return { pct: redondeado, tono, texto: `${signo}${redondeado.toFixed(2)}%` };
}

/** Cuántos se pueden seguir. Una watchlist de cincuenta no es una watchlist. */
export const MAX_WATCHLIST = 20;
