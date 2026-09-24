"use client";

import Link from "next/link";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Tarjetas en cuadrícula: título y detalle, ya resueltos. */
export default function SeccionTarjetas({ data, title, alAceptar }: PropsDeSeccion<"cards">) {
  return (
    <div className="ag-card">
      <h3 className="ag-card-titulo">{title ?? data.titulo}</h3>
      <div className="ag-tarjetas">
        {data.items.map((it) => {
          const cuerpo = (
            <>
              <strong>{it.titulo}</strong>
              {it.detalle && <span className="ag-muted">{it.detalle}</span>}
            </>
          );
          return it.href ? (
            <Link key={it.id} href={it.href} className="ag-tarjeta" onClick={() => alAceptar(it.href!)}>
              {cuerpo}
            </Link>
          ) : (
            <div key={it.id} className="ag-tarjeta">
              {cuerpo}
            </div>
          );
        })}
      </div>
    </div>
  );
}

registrarSeccion("cards", SeccionTarjetas);
