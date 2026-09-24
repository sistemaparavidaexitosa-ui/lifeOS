"use client";

import { useContext, useState, useTransition } from "react";
import { acceptProposal, dismissProposal } from "@/lib/coach/actions";
import { registrarSeccion, type PropsDeSeccion } from "../registro";
import { ContextoDelAgente } from "../contexto";

type Estado = { tipo: "hecho" } | { tipo: "error"; motivo: string };

/** Las propuestas del coach: aceptar reusa la Server Action de siempre, descartar las oculta. */
export default function SeccionRecomendaciones({ data, title, alAceptar }: PropsDeSeccion<"recomendaciones">) {
  const { workspaceId } = useContext(ContextoDelAgente);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [pendiente, startTransition] = useTransition();

  function aceptar(propuestaId: string) {
    startTransition(async () => {
      const r = await acceptProposal(propuestaId, workspaceId);
      if (r.ok) {
        setEstados((e) => ({ ...e, [propuestaId]: { tipo: "hecho" } }));
        if (r.href) alAceptar(r.href);
      } else {
        setEstados((e) => ({ ...e, [propuestaId]: { tipo: "error", motivo: r.reason ?? "No se pudo." } }));
      }
    });
  }

  function descartar(propuestaId: string) {
    startTransition(async () => {
      await dismissProposal(propuestaId);
      setOcultos((o) => new Set(o).add(propuestaId));
    });
  }

  const visibles = data.items.filter((it) => !ocultos.has(it.propuestaId));
  if (visibles.length === 0) return null;

  return (
    <div className="ag-card">
      {title && <h3 className="ag-card-titulo">{title}</h3>}
      <ul className="ag-filas">
        {visibles.map((it) => {
          const estado = estados[it.propuestaId];
          return (
            <li key={it.propuestaId} className="ag-fila ag-fila-recomendacion">
              <span className="ag-fila-texto">
                <strong>{it.titulo}</strong>
                <span className="ag-muted">{it.motivo}</span>
              </span>
              {estado?.tipo === "hecho" ? (
                <span className="ag-tono-ok">Hecho</span>
              ) : estado?.tipo === "error" ? (
                <span className="ag-tono-bad">{estado.motivo}</span>
              ) : (
                <span className="ag-acciones">
                  <button
                    type="button"
                    className="ag-boton-chico"
                    disabled={pendiente}
                    onClick={() => aceptar(it.propuestaId)}
                  >
                    Aceptar
                  </button>
                  <button
                    type="button"
                    className="ag-boton-chico ag-boton-chico-suave"
                    disabled={pendiente}
                    onClick={() => descartar(it.propuestaId)}
                  >
                    Descartar
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

registrarSeccion("recomendaciones", SeccionRecomendaciones);
