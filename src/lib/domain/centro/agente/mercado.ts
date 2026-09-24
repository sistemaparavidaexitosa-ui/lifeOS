// src/lib/domain/centro/agente/mercado.ts
// La capacidad «mercado», sin red (D-195). Puro, probado en
// tests/domain/centro-agente-mercado.test.ts.
//
// NUNCA UNA CIFRA INVENTADA. Sin llave de mercado, las filas salen con el
// ticker y sin precio, y el componente dice que falta la fuente. El portafolio
// es la suma de TUS valuaciones registradas —no se valora en vivo: `investments`
// no guarda ticker ni cantidad— y dice de cuándo es.

import { addDaysISO } from "../../datetime.ts";
import { normalizarTicker, variacion } from "../../money/watchlist.ts";
import { fdate, money } from "../../../format.ts";
import type { AnySection } from "../runtime/types.ts";
import { tieneCifras } from "./texto.ts";

export const RANGOS = ["1D", "1S", "1M", "1A"] as const;
export type Rango = (typeof RANGOS)[number];
export const VISTAS = ["portafolio", "movimientos", "watchlist", "grafica"] as const;
export type Vista = (typeof VISTAS)[number];

export const SIN_FUENTE = "Falta conectar la fuente de mercado.";
const MAX_TICKERS = 8;
const MAX_NOTA = 80;
const MIN_HISTORIA = 3;

export interface ParametrosMercado {
  vista: Vista;
  tickers: string[];
  rango: Rango;
  notas: Record<string, string>;
}

export function leerParametrosMercado(raw: unknown): ParametrosMercado {
  const r = (raw ?? {}) as Record<string, unknown>;
  const vista = (VISTAS as readonly string[]).includes(r.vista as string) ? (r.vista as Vista) : "watchlist";
  const rango = (RANGOS as readonly string[]).includes(r.rango as string) ? (r.rango as Rango) : "1S";
  const tickers: string[] = [];
  for (const t of Array.isArray(r.tickers) ? r.tickers : []) {
    const n = typeof t === "string" ? normalizarTicker(t) : null;
    if (n && !tickers.includes(n) && tickers.length < MAX_TICKERS) tickers.push(n);
  }
  const notas: Record<string, string> = {};
  const crudas = r.notas && typeof r.notas === "object" ? (r.notas as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(crudas)) {
    const t = normalizarTicker(k);
    const texto = typeof v === "string" ? v.trim().slice(0, MAX_NOTA) : "";
    if (t && texto && !tieneCifras(texto)) notas[t] = texto;
  }
  return { vista, tickers, rango, notas };
}

const TRAMO: Record<Rango, { n: number; unidad: string; dias: number }> = {
  "1D": { n: 5, unidad: "minute", dias: 1 },
  "1S": { n: 1, unidad: "hour", dias: 7 },
  "1M": { n: 1, unidad: "day", dias: 31 },
  "1A": { n: 1, unidad: "week", dias: 366 }
};

export function rutaDeSerie(ticker: string, rango: Rango, hoyISO: string): string {
  const t = TRAMO[rango];
  const desde = addDaysISO(hoyISO, -t.dias);
  return `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${t.n}/${t.unidad}/${desde}/${hoyISO}?adjusted=true&sort=asc&limit=5000`;
}

export interface CotizacionPura {
  ticker: string;
  nombre: string;
  precio: number | null;
  pct: number | null;
}

export interface InversionPura {
  valuation: number | null;
  currency: string;
  as_of: string | null;
}

export interface EntradaMercado {
  parametros: ParametrosMercado;
  moneda: string;
  locale: string;
  /** `false` = sin POLYGON_API_KEY. */
  configurado: boolean;
  cotizaciones: CotizacionPura[];
  /** Cierres por ticker, del más viejo al más nuevo. */
  series: Record<string, number[]>;
  inversiones: InversionPura[];
  /** Patrimonio neto histórico (`net_worth_snapshots`), para la línea del portafolio. */
  historia: { x: string; y: number }[];
}

/** Los precios de mercado vienen en USD: se formatean en su moneda, no en la del perfil. */
const precioDe = (p: number | null, locale: string) => (p === null ? null : money(p, "USD", locale));

function fila(c: CotizacionPura, locale: string) {
  const v = variacion(c.pct);
  return { ticker: c.ticker, nombre: c.nombre, precio: precioDe(c.precio, locale), variacion: v?.texto ?? null, tono: v?.tono ?? null };
}

export function seccionesDeMercado(e: EntradaMercado): AnySection[] {
  const { parametros: p } = e;

  if (p.vista === "portafolio") {
    const propias = e.inversiones.filter((i) => i.currency === e.moneda && typeof i.valuation === "number");
    const otras = e.inversiones.length - propias.length;
    const total = propias.reduce((s, i) => s + (i.valuation ?? 0), 0);
    const fechas = propias.map((i) => i.as_of).filter((f): f is string => !!f).sort();
    const ultima = fechas[fechas.length - 1];
    const nota = [
      ultima ? `Valuación al ${fdate(ultima, e.locale)}` : "Sin fecha de valuación",
      otras > 0 ? `${otras} ${otras === 1 ? "inversión" : "inversiones"} en otra moneda no ${otras === 1 ? "suma" : "suman"}` : null
    ]
      .filter(Boolean)
      .join(" · ");
    return [{
      id: "mercado-portafolio",
      kind: "portfolio",
      title: "Tu portafolio hoy",
      data: { total: money(total, e.moneda, e.locale), nota, serie: e.historia.length >= MIN_HISTORIA ? e.historia : [] }
    }];
  }

  const elegidas = p.tickers.length ? e.cotizaciones.filter((c) => p.tickers.includes(c.ticker)) : e.cotizaciones;

  if (p.vista === "grafica") {
    const t = p.tickers[0] ?? elegidas[0]?.ticker;
    const serie = t ? e.series[t] ?? [] : [];
    if (!t || serie.length < 2) {
      return [{ id: "mercado-grafica", kind: "emptyState", title: t ?? "Mercado", data: { mensaje: SIN_FUENTE } }];
    }
    return [{
      id: "mercado-grafica",
      kind: "chart",
      data: { titulo: `${t} · ${p.rango}`, tipo: "linea", unidad: "USD", puntos: serie.map((y, i) => ({ x: String(i), y })) }
    }];
  }

  if (elegidas.length === 0) {
    return [{ id: `mercado-${p.vista}`, kind: "emptyState", title: "Mercado", data: { mensaje: "No sigues ningún ticker todavía: añádelos en Watchlist." } }];
  }

  if (p.vista === "movimientos") {
    const orden = [...elegidas].sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)).slice(0, MAX_TICKERS);
    return [{
      id: "mercado-movimientos",
      kind: "movimientos",
      title: "Principales movimientos",
      data: { configurado: e.configurado, items: orden.map((c) => ({ ...fila(c, e.locale), nota: p.notas[c.ticker] ?? null })) }
    }];
  }

  return [{
    id: "mercado-watchlist",
    kind: "watchlist",
    title: "Tu watchlist",
    data: { configurado: e.configurado, items: elegidas.slice(0, 20).map((c) => ({ ...fila(c, e.locale), serie: e.series[c.ticker] ?? [] })) }
  }];
}
