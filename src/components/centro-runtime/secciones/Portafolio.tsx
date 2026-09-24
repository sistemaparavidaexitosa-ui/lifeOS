"use client";

import { trazo } from "@/lib/domain/centro/agente/grafica.ts";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

const ANCHO = 300;
const ALTO = 80;

/** El total del portafolio, grande, con una línea suave debajo (maqueta). */
export default function SeccionPortafolio({ data, title }: PropsDeSeccion<"portfolio">) {
  const puntos = data.serie.map((p) => p.y);
  const linea = puntos.length > 1 ? trazo(puntos, ANCHO, ALTO) : "";
  const area = linea ? `${linea} L${ANCHO},${ALTO} L0,${ALTO} Z` : "";

  return (
    <div className="ag-card">
      {title && <h3 className="ag-card-titulo">{title}</h3>}
      <p className="ag-cifra-grande">{data.total}</p>
      <p className="ag-muted">{data.nota}</p>
      {linea && (
        <svg
          className="ag-portafolio-linea"
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          width="100%"
          height={ALTO}
          aria-hidden
        >
          <path d={area} fill="url(#ag-portafolio-area)" stroke="none" />
          <path d={linea} fill="none" stroke="#16a34a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <defs>
            <linearGradient id="ag-portafolio-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      )}
    </div>
  );
}

registrarSeccion("portfolio", SeccionPortafolio);
