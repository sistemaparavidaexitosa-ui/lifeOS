"use client";

import Link from "next/link";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Los bloques de un día por hora, como una agenda: hora a la izquierda, qué a la derecha. */
export default function SeccionAgenda({ data, title, alAceptar }: PropsDeSeccion<"agenda">) {
  return (
    <div className="ag-card">
      <h3 className="ag-card-titulo">{title ?? data.titulo}</h3>
      <ol className="ag-agenda">
        {data.items.map((it) => {
          const cuerpo = (
            <>
              <span className="ag-agenda-hora">
                {it.inicio}
                {it.fin && <span className="ag-muted">{it.fin}</span>}
              </span>
              <span className="ag-agenda-bloque">
                <strong>{it.titulo}</strong>
                {it.detalle && <span className="ag-muted">{it.detalle}</span>}
              </span>
            </>
          );
          return (
            <li key={it.id}>
              {it.href ? (
                <Link href={it.href} className="ag-agenda-item" onClick={() => alAceptar(it.href!)}>
                  {cuerpo}
                </Link>
              ) : (
                <div className="ag-agenda-item">{cuerpo}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

registrarSeccion("agenda", SeccionAgenda);
