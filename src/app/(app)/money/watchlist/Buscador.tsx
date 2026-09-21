"use client";
// Buscar un símbolo y seguirlo, como en TradingView (D-184).

import { useEffect, useRef, useState, useTransition } from "react";
import { buscarTickersAction } from "./acciones";
import { seguirTicker, dejarDeSeguir, type FilaDeWatchlist } from "@/lib/money/watchlist-actions";
import type { TickerEncontrado } from "@/lib/money/polygon";
import type { Cotizacion } from "@/lib/money/polygon";
import { Chip } from "@/components/ui";

/** Lo que se espera a que dejes de teclear. El mismo que la paleta de comandos. */
const RETARDO_MS = 250;

export default function Buscador({
  inicial,
  cotizaciones,
  avisoDeMercado
}: {
  inicial: FilaDeWatchlist[];
  cotizaciones: Cotizacion[];
  avisoDeMercado: string | null;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TickerEncontrado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seguidos, setSeguidos] = useState(inicial);
  const [pendiente, startTransition] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const porTicker = new Map(cotizaciones.map((c) => [c.ticker, c]));

  useEffect(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    temporizador.current = setTimeout(() => {
      startTransition(async () => {
        const r = await buscarTickersAction(q);
        if (!r.ok) {
          setError(r.reason);
          setHits([]);
          return;
        }
        setError(null);
        setHits(r.datos);
      });
    }, RETARDO_MS);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [query]);

  function seguir(t: TickerEncontrado) {
    startTransition(async () => {
      const r = await seguirTicker(t.ticker, t.nombre);
      if (!r.ok) {
        setError(r.reason ?? "No se pudo seguir.");
        return;
      }
      setError(null);
      setSeguidos((prev) =>
        prev.some((s) => s.ticker === t.ticker) ? prev : [...prev, { id: `local-${t.ticker}`, ticker: t.ticker, nombre: t.nombre }]
      );
      setQuery("");
      setHits([]);
    });
  }

  function quitar(fila: FilaDeWatchlist) {
    startTransition(async () => {
      const r = await dejarDeSeguir(fila.id);
      if (!r.ok) {
        setError(r.reason ?? "No se pudo quitar.");
        return;
      }
      setSeguidos((prev) => prev.filter((s) => s.id !== fila.id));
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="card">
        {/* Sin `className`: globals.css estiliza `input` por elemento y este
            proyecto no tiene una clase `.input`. */}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca un símbolo o una empresa…"
          aria-label="Buscar en el mercado"
          style={{ width: "100%" }}
        />

        {pendiente && (
          <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Buscando…
          </div>
        )}

        {hits.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2.5">
            {hits.map((h) => (
              <button key={h.ticker} className="ex-menu-item" disabled={pendiente} onClick={() => seguir(h)}>
                <b>{h.ticker}</b> <span style={{ color: "var(--muted)" }}>{h.nombre}</span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="text-xs mt-2" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-bold mb-2">Lo que sigues</h3>

        {/* El aviso de que no hay precios va ARRIBA de la lista y no en lugar de
            ella: lo que sigues es tuyo y se enseña aunque el mercado no
            conteste. */}
        {avisoDeMercado && (
          <div className="text-xs mb-2" style={{ color: "var(--warn)" }}>
            {avisoDeMercado}
          </div>
        )}

        {!seguidos.length && (
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Todavía no sigues nada. Busca arriba.
          </div>
        )}

        {seguidos.map((s) => {
          const c = porTicker.get(s.ticker);
          return (
            <div key={s.id} className="list-item">
              <div className="min-w-0">
                <b>{s.ticker}</b>
                <div className="text-xs truncate" style={{ color: "var(--muted)" }}>
                  {s.nombre}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Sin dato NO se pinta un cero: un precio que no se tiene no
                    es cero, es que no se tiene. */}
                {c?.precio != null && <span className="text-sm">{c.precio.toFixed(2)}</span>}
                {c?.variacion && <Chip kind={c.variacion.tono}>{c.variacion.texto}</Chip>}
                <button className="btn-ghost btn-sm" disabled={pendiente} onClick={() => quitar(s)}>
                  Quitar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
