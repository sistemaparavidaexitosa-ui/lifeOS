"use client";

import { trazo } from "@/lib/domain/centro/agente/grafica.ts";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

const ANCHO = 300;
const ALTO = 80;

/** Una línea o unas barras, según `tipo`. Sin librería: es un `path` o unos `rect`. */
export default function SeccionGrafica({ data, title }: PropsDeSeccion<"chart">) {
  const valores = data.puntos.map((p) => p.y);
  const min = valores.length ? Math.min(...valores) : 0;
  const max = valores.length ? Math.max(...valores) : 0;

  return (
    <div className="ag-card">
      <div className="ag-card-cabecera">
        <h3 className="ag-card-titulo">{title ?? data.titulo}</h3>
        <span className="ag-muted">{data.unidad}</span>
      </div>
      {valores.length > 1 && (
        <svg
          className="ag-grafica"
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          width="100%"
          height={ALTO}
          aria-hidden
        >
          {data.tipo === "barras" ? (
            valores.map((v, i) => {
              const anchoBarra = ANCHO / valores.length;
              const alturaBarra = max === min ? ALTO / 2 : ((v - min) / (max - min)) * ALTO;
              return (
                <rect
                  key={i}
                  x={i * anchoBarra + anchoBarra * 0.15}
                  y={ALTO - alturaBarra}
                  width={anchoBarra * 0.7}
                  height={alturaBarra}
                  fill="var(--ag-text)"
                />
              );
            })
          ) : (
            <path
              d={trazo(valores, ANCHO, ALTO)}
              fill="none"
              stroke="var(--ag-text)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}
      <div className="ag-grafica-limites">
        <span className="ag-muted">{min}</span>
        <span className="ag-muted">{max}</span>
      </div>
    </div>
  );
}

registrarSeccion("chart", SeccionGrafica);
