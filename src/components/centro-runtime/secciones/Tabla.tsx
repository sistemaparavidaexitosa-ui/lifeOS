"use client";

import { useRouter } from "next/navigation";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Una tabla: columnas y celdas ya como texto; el servidor las formateó. */
export default function SeccionTabla({ data, title, alAceptar }: PropsDeSeccion<"table">) {
  const router = useRouter();

  function irA(href: string) {
    alAceptar(href);
    router.push(href);
  }

  return (
    <div className="ag-card">
      <h3 className="ag-card-titulo">{title ?? data.titulo}</h3>
      <table className="ag-tabla">
        <thead>
          <tr>
            {data.columnas.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.filas.map((f) => (
            <tr
              key={f.id}
              className={f.href ? "ag-tabla-fila-enlace" : undefined}
              tabIndex={f.href ? 0 : undefined}
              role={f.href ? "link" : undefined}
              onClick={f.href ? () => irA(f.href!) : undefined}
              onKeyDown={
                f.href
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        if (e.key === " ") e.preventDefault();
                        irA(f.href!);
                      }
                    }
                  : undefined
              }
            >
              {f.celdas.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

registrarSeccion("table", SeccionTabla);
