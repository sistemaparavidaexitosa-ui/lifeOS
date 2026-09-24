"use client";

import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** De una a cuatro cifras en cuadrícula. Sin enlaces: son un vistazo, no una lista. */
export default function SeccionMetricas({ data, title }: PropsDeSeccion<"metricas">) {
  return (
    <div className="ag-card">
      {(title ?? data.titulo) && <h3 className="ag-card-titulo">{title ?? data.titulo}</h3>}
      <div className="ag-metricas">
        {data.items.map((m) => (
          <div key={m.etiqueta} className="ag-metrica">
            <span className="ag-metrica-valor">{m.valor}</span>
            <span className="ag-muted">{m.etiqueta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

registrarSeccion("metricas", SeccionMetricas);
