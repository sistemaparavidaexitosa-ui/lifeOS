"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarMovimiento } from "@/app/(app)/investments/actions";
import { NOMBRE_DE_TIPO } from "@/lib/domain/centro/agente/inversiones.ts";
import { money, fdate } from "@/lib/format";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

type Estado = "pendiente" | "guardado" | "descartado";

/**
 * Un movimiento que el agente propone (D-202). No existe hasta que la persona
 * pulsa Guardar, y se guarda por `registrarMovimiento`, la MISMA acción que
 * /investments/[id]: zod, RLS y el tope del retiro valen igual se registre
 * desde donde se registre.
 */
export default function SeccionPropuestaMovimiento({ data, alAceptar }: PropsDeSeccion<"propuestaMovimiento">) {
  const [estado, setEstado] = useState<Estado>("pendiente");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const href = `/investments/${data.investmentId}`;

  function guardar() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("kind", data.tipo);
      fd.set("amount", String(data.monto));
      fd.set("occurredOn", data.fecha);
      fd.set("note", data.nota ?? "");
      try {
        const r = await registrarMovimiento(data.investmentId, fd);
        if (r.ok) {
          setEstado("guardado");
          setError(null);
        } else setError(r.reason);
      } catch {
        setError("No se pudo guardar. Inténtalo de nuevo.");
      }
    });
  }

  if (estado === "descartado") return null;

  return (
    <div className="ag-card">
      <h3 className="ag-card-titulo">Registrar en inversiones</h3>
      <p>
        {NOMBRE_DE_TIPO[data.tipo]} de <b>{money(data.monto, data.moneda)}</b> en <b>{data.posicion}</b> el {fdate(data.fecha)}
      </p>
      {data.nota && <p className="ag-muted">{data.nota}</p>}
      {error && <p className="ag-tono-bad">{error}</p>}
      {estado === "guardado" ? (
        <p className="ag-acciones">
          <span className="ag-tono-ok">Guardado ✓</span>
          <a className="ag-boton-chico" href={href} onClick={(e) => {
              e.preventDefault();
              alAceptar(href);
              router.push(href);
            }}>
            Ver curva
          </a>
        </p>
      ) : (
        <p className="ag-acciones">
          <button type="button" className="ag-boton-chico" disabled={pending} onClick={guardar}>
            {pending ? "…" : "Guardar"}
          </button>
          <button type="button" className="ag-boton-chico" disabled={pending} onClick={() => setEstado("descartado")}>
            Descartar
          </button>
        </p>
      )}
    </div>
  );
}

registrarSeccion("propuestaMovimiento", SeccionPropuestaMovimiento);
