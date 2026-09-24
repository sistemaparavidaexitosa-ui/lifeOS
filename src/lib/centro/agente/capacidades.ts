// src/lib/centro/agente/capacidades.ts
// Las capacidades enchufables del agente (D-195). SERVIDOR.
//
// Añadir una = una entrada en CAPACIDADES_REGISTRADAS con su hidratador. El
// agente la ve en SYSTEM_AGENTE y el renderer la pinta con sus componentes.
import "server-only";
import type { AnySection } from "@/lib/domain/centro/runtime/types.ts";
import { leerParametrosMercado, seccionesDeMercado } from "@/lib/domain/centro/agente/mercado.ts";
import { cotizaciones, serieDe } from "@/lib/money/polygon";
import { listarWatchlist } from "@/lib/money/watchlist-actions";
import { polygonApiKey } from "@/config/env";
import { armarPantallaConProyectos } from "@/lib/centro/runtime/pantalla";
import { loadRitualContent, loadRitualGate } from "@/lib/data/ritual";
import { sugerenciasDelCentro } from "@/lib/centro/sugerencias";
import { flagsDelRuntime } from "@/config/env";
import type { Cerebro } from "@/lib/ai-chat/cerebro";

/**
 * Lo que devuelve una capacidad: sus secciones y los proyectos que SUS lecturas
 * vieron (bajo la RLS de la persona). El turno los suma a los de las
 * herramientas antes de validar: una sección de «Hoy» enlaza proyectos que el
 * modelo nunca leyó, y sin ellos `destinoValido` la rechazaba.
 */
export interface ResultadoDeCapacidad {
  secciones: AnySection[];
  proyectos: { id: string }[];
}

export type Hidratador = (parametros: Record<string, unknown>, cerebro: Cerebro) => Promise<ResultadoDeCapacidad>;

async function mercado(parametros: Record<string, unknown>, c: Cerebro): Promise<ResultadoDeCapacidad> {
  const p = leerParametrosMercado(parametros);
  const configurado = polygonApiKey() !== null;
  const lista = await listarWatchlist();
  const tickers = p.tickers.length ? p.tickers : lista.map((w) => w.ticker);
  const nombres = new Map(lista.map((w) => [w.ticker, w.nombre ?? w.ticker]));

  const [cot, inv, snap] = await Promise.all([
    configurado && tickers.length ? cotizaciones(tickers) : Promise.resolve(null),
    p.vista === "portafolio" ? c.supabase.from("investments").select("valuation, currency, as_of") : Promise.resolve(null),
    p.vista === "portafolio" ? c.supabase.from("net_worth_snapshots").select("as_of, net").order("as_of", { ascending: true }).limit(60) : Promise.resolve(null)
  ]);

  const precios = new Map((cot?.ok ? cot.datos : []).map((q) => [q.ticker, q]));
  const cotizacionesPuras = tickers.map((t) => ({
    ticker: t,
    nombre: nombres.get(t) ?? t,
    precio: precios.get(t)?.precio ?? null,
    pct: precios.get(t)?.variacion?.pct ?? null
  }));

  const quiereSeries = configurado && (p.vista === "watchlist" || p.vista === "grafica");
  const paraSerie = p.vista === "grafica" ? tickers.slice(0, 1) : tickers.slice(0, 8);
  const rango = p.vista === "watchlist" ? "1S" : p.rango;
  const series: Record<string, number[]> = {};
  if (quiereSeries) {
    const rs = await Promise.all(paraSerie.map((t) => serieDe(t, rango, c.today)));
    rs.forEach((r, i) => {
      if (r.ok) series[paraSerie[i]!] = r.datos;
    });
  }

  const secciones = seccionesDeMercado({
    parametros: p,
    moneda: c.moneda,
    locale: c.locale,
    configurado,
    cotizaciones: cotizacionesPuras,
    series,
    inversiones: (inv?.data ?? []).map((i) => ({ valuation: i.valuation, currency: i.currency, as_of: i.as_of })),
    historia: (snap?.data ?? []).map((s) => ({ x: s.as_of, y: Number(s.net) })).filter((p) => Number.isFinite(p.y))
  });
  return { secciones, proyectos: [] };
}

const NADA: ResultadoDeCapacidad = { secciones: [], proyectos: [] };

async function hoy(): Promise<ResultadoDeCapacidad> {
  const puerta = await loadRitualGate();
  if (!puerta) return NADA;
  const [contenido, pensado] = await Promise.all([loadRitualContent(puerta), sugerenciasDelCentro().catch(() => ({ resumen: "" }))]);
  if (!contenido) return NADA;
  const { screen, proyectos } = await armarPantallaConProyectos(
    { kind: "hoy" },
    { puerta, contenido, resumen: pensado.resumen, flags: flagsDelRuntime() }
  );
  return { secciones: screen?.sections ?? [], proyectos };
}

export const CAPACIDADES_REGISTRADAS: Record<"mercado" | "hoy", Hidratador> = { mercado, hoy };
