"use client";

import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Los movimientos del día: ticker, precio, variación y una nota bajo el ticker. */
export default function SeccionMovimientos({ data, title, alAceptar }: PropsDeSeccion<"movimientos">) {
  return (
    <div className="ag-card">
      <div className="ag-card-cabecera">
        <h3 className="ag-card-titulo">{title ?? "Movimientos"}</h3>
      </div>
      {!data.configurado && <p className="ag-aviso">Falta conectar la fuente de mercado.</p>}
      <ul className="ag-filas">
        {data.items.map((m) => (
          <li key={m.ticker} className="ag-fila">
            <span className="ag-fila-texto">
              <strong>{m.ticker}</strong>
              {m.nota && <span className="ag-muted">{m.nota}</span>}
            </span>
            <span className="ag-fila-cifra">
              <span>{m.precio ?? "—"}</span>
              {m.variacion && <span className={`ag-tono-${m.tono ?? "info"}`}>{m.variacion}</span>}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/money/watchlist" className="ag-card-pie" onClick={() => alAceptar("/money/watchlist")}>
        Ver watchlist <IconChevronRight aria-hidden className="ag-chevron" />
      </Link>
    </div>
  );
}

registrarSeccion("movimientos", SeccionMovimientos);
