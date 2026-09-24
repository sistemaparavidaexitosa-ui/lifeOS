"use client";

import { useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  const fallo = (propuestaId: string, motivo: string) =>
    setEstados((e) => ({ ...e, [propuestaId]: { tipo: "error", motivo } }));

  // Una Server Action que LANZA (sin red, sesión caducada) se queda en SU
  // fila como error, no sube al error boundary y se lleva el Centro entero.
  function aceptar(propuestaId: string) {
    startTransition(async () => {
      try {
        const r = await acceptProposal(propuestaId, workspaceId);
        if (!r.ok) return fallo(propuestaId, r.reason ?? "No se pudo.");
        setEstados((e) => ({ ...e, [propuestaId]: { tipo: "hecho" } }));
        // Un «foco» lleva a un sitio: se cierra el Centro Y se navega, como
        // hacen BarraCaptura y Navegacion con el mismo `href`.
        if (r.href) {
          alAceptar(r.href);
          router.push(r.href);
        }
      } catch {
        fallo(propuestaId, "No se pudo. Inténtalo de nuevo.");
      }
    });
  }

  function descartar(propuestaId: string) {
    startTransition(async () => {
      try {
        const r = await dismissProposal(propuestaId);
        if (!r.ok) return fallo(propuestaId, r.reason ?? "No se pudo descartar.");
        setOcultos((o) => new Set(o).add(propuestaId));
      } catch {
        fallo(propuestaId, "No se pudo descartar. Inténtalo de nuevo.");
      }
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
