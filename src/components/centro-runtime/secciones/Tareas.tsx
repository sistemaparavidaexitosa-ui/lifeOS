"use client";

import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { fdate } from "@/lib/format";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Una lista numerada: el número dice el orden, y el orden es del generador. */
export default function SeccionTareas({ data, title, alAceptar }: PropsDeSeccion<"tasks">) {
  return (
    <div className="rt-bloque">
      <div className="rt-bloque-cabecera">
        <h2 className="rt-bloque-titulo">{title ?? "Tareas"}</h2>
        <span className="rt-muted">{fdate(data.fechaISO)}</span>
      </div>
      <ol className="rt-lista">
        {data.items.map((t, i) => {
          const fila = (
            <>
              <span className="rt-num" aria-hidden>
                {i + 1}
              </span>
              <span className="rt-lista-texto">
                <span>{t.titulo}</span>
                {t.contexto && <span className="rt-muted">{t.contexto}</span>}
              </span>
              {t.href && <IconChevronRight aria-hidden className="rt-chevron" />}
            </>
          );
          const destino = t.href;
          return (
            <li key={t.id}>
              {destino ? (
                <Link href={destino} className="rt-fila" onClick={() => alAceptar(destino)}>
                  {fila}
                </Link>
              ) : (
                <div className="rt-fila">{fila}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

registrarSeccion("tasks", SeccionTareas);
