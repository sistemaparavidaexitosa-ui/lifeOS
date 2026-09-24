"use client";

import { useState, type KeyboardEvent } from "react";
import BarraCaptura from "@/components/ritual/BarraCaptura";
import { IconPlus } from "@/components/icons";

/**
 * El compositor del Centro-agente (D-194): una píldora, no una barra.
 *
 * El «+» no manda texto — abre la hoja de captura rápida de siempre
 * (`BarraCaptura`), que sigue funcionando exactamente igual. Lo que se
 * escribe aquí es la conversación: entra un turno por envío.
 */
export default function Composer({
  onEnviar,
  ocupado,
  workspaceId,
  onIrA,
  hojaAbierta,
  onHoja
}: {
  onEnviar: (texto: string) => void;
  ocupado: boolean;
  workspaceId: string | null;
  onIrA: () => void;
  /** La hoja del «+». La controla `CentroAgente` para que Escape la cierre primero. */
  hojaAbierta: boolean;
  onHoja: (abierta: boolean) => void;
}) {
  const [texto, setTexto] = useState("");
  const [huboEnvio, setHuboEnvio] = useState(false);

  function enviar() {
    const limpio = texto.trim();
    if (!limpio || ocupado) return;
    onEnviar(limpio);
    setTexto("");
    setHuboEnvio(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  return (
    <div className="ag-pie">
      {hojaAbierta && (
        <div className="ag-hoja-fondo" onClick={() => onHoja(false)}>
          <div className="ag-hoja" onClick={(e) => e.stopPropagation()}>
            <BarraCaptura workspaceId={workspaceId} onNavegar={onIrA} />
          </div>
        </div>
      )}

      <form
        className="ag-composer"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <button
          type="button"
          className="ag-mas"
          onClick={() => onHoja(!hojaAbierta)}
          aria-label="Captura rápida"
          aria-expanded={hojaAbierta}
        >
          <IconPlus width={18} height={18} />
        </button>

        <textarea
          className="ag-campo"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={huboEnvio ? "Escribe un mensaje…" : "¿Qué quieres hacer hoy?"}
          aria-label="Escribe un mensaje"
          rows={1}
          // `readOnly` y no `disabled`: un campo deshabilitado pierde el foco
          // en cada envío. `enviar` ya ignora lo que llegue mientras piensa.
          readOnly={ocupado}
          aria-busy={ocupado}
        />

        <button className="ag-enviar" type="submit" disabled={ocupado || !texto.trim()} aria-label="Enviar">
          →
        </button>
      </form>
    </div>
  );
}
