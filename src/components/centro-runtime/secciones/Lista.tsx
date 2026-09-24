"use client";

import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Una lista genérica del agente: título, detalle y estado, ya resueltos. */
export default function SeccionLista({ data, title, alAceptar }: PropsDeSeccion<"lista">) {
  return (
    <div className="ag-card">
      <h3 className="ag-card-titulo">{title ?? data.titulo}</h3>
      <ul className="ag-filas">
        {data.items.map((it) => {
          const cuerpo = (
            <>
              <span className="ag-fila-texto">
                <strong>{it.titulo}</strong>
                {it.detalle && <span className="ag-muted">{it.detalle}</span>}
              </span>
              {it.estado && <span className="ag-muted">{it.estado}</span>}
              {it.href && <IconChevronRight aria-hidden className="ag-chevron" />}
            </>
          );
          return (
            <li key={it.id} className="ag-fila">
              {it.href ? (
                <Link href={it.href} className="ag-fila-enlace" onClick={() => alAceptar(it.href!)}>
                  {cuerpo}
                </Link>
              ) : (
                cuerpo
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

registrarSeccion("lista", SeccionLista);
