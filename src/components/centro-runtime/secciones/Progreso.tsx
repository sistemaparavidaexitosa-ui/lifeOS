"use client";

import Link from "next/link";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Cosas con meta y cuánto llevan: libros, metas, ahorros. */
export default function SeccionProgreso({ data, title, alAceptar }: PropsDeSeccion<"progreso">) {
  return (
    <div className="ag-card">
      <h3 className="ag-card-titulo">{title ?? data.titulo}</h3>
      <ul className="ag-progreso">
        {data.items.map((it) => {
          const cuerpo = (
            <>
              <span className="ag-progreso-cabeza">
                <strong>{it.titulo}</strong>
                <span className="ag-muted">{it.valor}</span>
              </span>
              <span className="ag-barra" aria-hidden="true">
                <span style={{ transform: `scaleX(${Math.max(0, Math.min(100, it.pct)) / 100})` }} />
              </span>
              {it.detalle && <span className="ag-muted">{it.detalle}</span>}
            </>
          );
          return (
            <li key={it.id}>
              {it.href ? (
                <Link href={it.href} className="ag-progreso-item" onClick={() => alAceptar(it.href!)} aria-label={`${it.titulo}: ${it.valor}`}>
                  {cuerpo}
                </Link>
              ) : (
                <div className="ag-progreso-item">{cuerpo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

registrarSeccion("progreso", SeccionProgreso);
