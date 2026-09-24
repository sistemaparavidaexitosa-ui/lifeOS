"use client";

import Link from "next/link";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Botones de destino directo: fondo negro, texto blanco (maqueta). */
export default function SeccionIrA({ data, title, alAceptar }: PropsDeSeccion<"irA">) {
  return (
    <div className="ag-card">
      {title && <h3 className="ag-card-titulo">{title}</h3>}
      <div className="ag-botones">
        {data.destinos.map((d) => (
          <Link key={d.href} href={d.href} className="ag-boton" onClick={() => alAceptar(d.href)}>
            {d.etiqueta}
          </Link>
        ))}
      </div>
    </div>
  );
}

registrarSeccion("irA", SeccionIrA);
