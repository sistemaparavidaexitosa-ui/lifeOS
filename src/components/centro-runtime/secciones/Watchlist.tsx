"use client";

import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { registrarSeccion, type PropsDeSeccion } from "../registro";
import Sparkline from "../Sparkline";

/** La watchlist de la maqueta: iniciales, precio, variación y sparkline. */
export default function SeccionWatchlist({ data, title, alAceptar }: PropsDeSeccion<"watchlist">) {
  return (
    <div className="ag-card">
      <div className="ag-card-cabecera">
        <h3 className="ag-card-titulo">{title ?? "Tu watchlist"}</h3>
        <span className="ag-muted">Rendimiento de hoy</span>
      </div>
      {!data.configurado && <p className="ag-aviso">Falta conectar la fuente de mercado.</p>}
      <ul className="ag-filas">
        {data.items.map((t) => (
          <li key={t.ticker} className="ag-fila">
            <span className="ag-avatar" aria-hidden>
              {t.ticker.slice(0, 4)}
            </span>
            <span className="ag-fila-texto">
              <strong>{t.ticker}</strong>
              <span className="ag-muted">{t.nombre}</span>
            </span>
            <span className="ag-fila-cifra">
              <span>{t.precio ?? "—"}</span>
              {t.variacion && <span className={`ag-tono-${t.tono ?? "info"}`}>{t.variacion}</span>}
            </span>
            {t.serie.length > 1 && <Sparkline puntos={t.serie} tono={t.tono} />}
          </li>
        ))}
      </ul>
      <Link href="/money/watchlist" className="ag-card-pie" onClick={() => alAceptar("/money/watchlist")}>
        Ver todos los tickers <IconChevronRight aria-hidden className="ag-chevron" />
      </Link>
    </div>
  );
}

registrarSeccion("watchlist", SeccionWatchlist);
