"use client";

import { useContext, useState } from "react";
import { registrarEntendimiento } from "@/lib/centro/agente/eventos";
import { ContextoDelAgente } from "../contexto";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/**
 * «¿Entendí bien?» (D-204). Un clic manda el turno siguiente y deja un
 * registro para que el Centro aprenda; la tarjeta queda contestada.
 */
export default function SeccionConfirmarEntendimiento({ data }: PropsDeSeccion<"confirmarEntendimiento">) {
  const { enviar, enfocar, ocupado } = useContext(ContextoDelAgente);
  const [usada, setUsada] = useState(false);

  function elegir(resultado: "seguir" | "alternativa" | "otra", texto: string | null) {
    if (usada) return;
    setUsada(true);
    void registrarEntendimiento(resultado);
    if (texto) enviar?.(texto);
    else enfocar?.();
  }

  return (
    <div className="ag-card">
      <p>
        <span className="ag-muted">Entendí: </span>
        {data.entendi}
      </p>
      <p className="ag-acciones">
        <button type="button" className="ag-boton-chico" disabled={usada || ocupado} onClick={() => elegir("seguir", `Sí, sigue: ${data.entendi}`)}>
          {data.seguir}
        </button>
        {data.alternativas.map((a, i) => (
          <button
            key={`${i}-${a.etiqueta}`}
            type="button"
            className="ag-boton-chico"
            disabled={usada || ocupado}
            onClick={() => elegir(a.texto ? "alternativa" : "otra", a.texto)}>
            {a.etiqueta}
          </button>
        ))}
      </p>
    </div>
  );
}

registrarSeccion("confirmarEntendimiento", SeccionConfirmarEntendimiento);
