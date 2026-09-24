"use client";

import Link from "next/link";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Una línea de tiempo: fecha y título, ya resueltos. */
export default function SeccionLineaDeTiempo({ data, title, alAceptar }: PropsDeSeccion<"timeline">) {
  return (
    <div className="ag-card">
      <h3 className="ag-card-titulo">{title ?? data.titulo}</h3>
      <ol className="ag-linea-tiempo">
        {data.items.map((it) => {
          const cuerpo = (
            <>
              <span className="ag-muted">{it.fecha}</span>
              <span>{it.titulo}</span>
            </>
          );
          return (
            <li key={it.id} className="ag-linea-tiempo-item">
              {it.href ? (
                <Link href={it.href} className="ag-linea-tiempo-enlace" onClick={() => alAceptar(it.href!)}>
                  {cuerpo}
                </Link>
              ) : (
                cuerpo
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

registrarSeccion("timeline", SeccionLineaDeTiempo);
