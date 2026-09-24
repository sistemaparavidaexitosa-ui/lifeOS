import "server-only";
// src/lib/money/polygon.ts
// El único sitio que habla con Polygon (D-184).
//
// MISMO CONTRATO QUE `gemini-provider.ts`: un punto único, sin SDK, con `fetch`
// y timeout, y NUNCA LANZA. Una API de mercado caída no puede tumbar la página
// de dinero, que se usa sin precios todos los días.
//
// NO SE CACHEA NADA EN LA BASE. Un precio guardado envejece en segundos y el
// sistema lo enseñaría como propio sin poder responder por él — que es
// exactamente lo que `validateAnchoring` impide en el otro extremo. O el precio
// viene de Polygon en esta petición, o no se enseña.
//
// AVISO HONESTO: las rutas y la forma de la respuesta están escritas contra la
// documentación de Polygon de memoria y NO se han ejercitado con una llave
// real. Si Polygon cambió algo, el síntoma será `ok: false` con el motivo de la
// API dentro —no un precio inventado—, y el arreglo son estas dos URL.

import { polygonApiKey } from "@/config/env";
import type { Variacion } from "@/lib/domain/money/watchlist.ts";
import { variacion } from "@/lib/domain/money/watchlist.ts";

// EL HOST SIGUE SIENDO `polygon.io` AUNQUE LA MARCA YA NO.
// polygon.io redirige a massive.com y la documentación vive allí, pero los dos
// hosts de API —`api.polygon.io` y `api.massive.com`— responden igual. Se deja
// el viejo porque es el que aparece en la llave que ya tienes contratada; si
// algún día deja de responder, cambiar esta línea es todo el trabajo.
//
// Comprobado contra el servidor real el 23-sep-2026, sin llave: las dos rutas
// de abajo devuelven 401 «Unknown API Key», que es la respuesta correcta a una
// petición bien formada. Ruta, parámetros y forma de pasar la llave son buenas;
// lo único sin ejercitar es una respuesta CON datos dentro.
const BASE = "https://api.polygon.io";
const TIMEOUT_MS = 10_000;

export interface TickerEncontrado {
  ticker: string;
  nombre: string;
  /** «stocks», «crypto»… lo que devuelva Polygon. Sirve para no mezclar. */
  mercado: string;
}

export interface Cotizacion {
  ticker: string;
  precio: number | null;
  variacion: Variacion | null;
}

export type Resultado<T> = { ok: true; datos: T } | { ok: false; reason: string };

const SIN_LLAVE = "Falta POLYGON_API_KEY: la watchlist necesita una fuente de mercado configurada.";

async function pedir<T>(ruta: string): Promise<Resultado<T>> {
  const key = polygonApiKey();
  if (!key) return { ok: false, reason: SIN_LLAVE };

  try {
    const res = await fetch(`${BASE}${ruta}${ruta.includes("?") ? "&" : "?"}apiKey=${key}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Los precios no se cachean entre peticiones: el valor de este dato es
      // que sea de ahora.
      cache: "no-store"
    });

    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      // El 429 se nombra aparte porque es el único que se arregla esperando, y
      // decir «error 429» a alguien no le dice qué hacer.
      if (res.status === 429) {
        return { ok: false, reason: "Polygon está limitando las peticiones. Inténtalo en un momento." };
      }
      return { ok: false, reason: `Polygon respondió ${res.status}. ${detalle.slice(0, 160)}`.trim() };
    }

    return { ok: true, datos: (await res.json()) as T };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error && error.name === "TimeoutError"
          ? "Polygon tardó demasiado en contestar."
          : "No se pudo hablar con Polygon."
    };
  }
}

/** Buscar un ticker por nombre o símbolo, como en TradingView. */
export async function buscarTickers(consulta: string): Promise<Resultado<TickerEncontrado[]>> {
  const q = consulta.trim();
  if (q.length < 1) return { ok: true, datos: [] };

  const r = await pedir<{ results?: { ticker: string; name?: string; market?: string }[] }>(
    `/v3/reference/tickers?search=${encodeURIComponent(q)}&active=true&limit=10`
  );
  if (!r.ok) return r;

  return {
    ok: true,
    datos: (r.datos.results ?? []).map((t) => ({
      ticker: t.ticker,
      nombre: t.name ?? t.ticker,
      mercado: t.market ?? ""
    }))
  };
}

/**
 * Cuánto valen ahora, en UNA petición para todos.
 *
 * Una llamada por ticker convertiría una watchlist de veinte en veinte viajes
 * de ida y vuelta cada vez que se pinta la página.
 */
export async function cotizaciones(tickers: readonly string[]): Promise<Resultado<Cotizacion[]>> {
  if (!tickers.length) return { ok: true, datos: [] };

  const r = await pedir<{ tickers?: { ticker: string; todaysChangePerc?: number; day?: { c?: number }; prevDay?: { c?: number } }[] }>(
    `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(",")}`
  );
  if (!r.ok) return r;

  const porTicker = new Map((r.datos.tickers ?? []).map((t) => [t.ticker, t]));

  return {
    ok: true,
    // Se devuelve una fila POR CADA ticker pedido, aunque Polygon no lo
    // conozca: la watchlist enseña lo que sigues, y uno que no cotiza hoy tiene
    // que verse en la lista, sin precio, en vez de desaparecer sin explicación.
    datos: tickers.map((ticker) => {
      const t = porTicker.get(ticker);
      // El cierre del día, y si el mercado no ha abierto, el anterior.
      const precio = t?.day?.c || t?.prevDay?.c || null;
      return { ticker, precio: precio ?? null, variacion: variacion(t?.todaysChangePerc) };
    })
  };
}
