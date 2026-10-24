"use client";

// Borrar sin `window.confirm`: se mantiene presionado y un relleno avanza de
// izquierda a derecha. Presionar es lento a propósito (1,2 s, lineal: se está
// decidiendo); soltar antes es instantáneo (el sistema responde). El relleno
// es un `clip-path` sobre una copia del botón, así el color del texto cambia
// justo en el borde del avance.

import { useRef, useState } from "react";

const DURACION_MS = 1200;

export default function MantenerParaBorrar({ etiqueta, onConfirm }: { etiqueta: string; onConfirm: () => void }) {
  const [presionado, setPresionado] = useState(false);
  const temporizador = useRef<number | null>(null);

  function empezar(e: React.PointerEvent) {
    if (e.button !== 0) return;
    setPresionado(true);
    temporizador.current = window.setTimeout(() => {
      setPresionado(false);
      onConfirm();
    }, DURACION_MS);
  }

  function soltar() {
    setPresionado(false);
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = null;
  }

  return (
    <button
      type="button"
      className="xr-borrar"
      data-presionado={presionado || undefined}
      onPointerDown={empezar}
      onPointerUp={soltar}
      onPointerLeave={soltar}
      onPointerCancel={soltar}
      onContextMenu={(e) => e.preventDefault()}
      // Con teclado no hay «mantener»: Enter confirma, que ya es deliberado.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onConfirm();
        }
      }}
    >
      <span className="xr-borrar-base">Mantén presionado para {etiqueta}</span>
      <span className="xr-borrar-relleno" aria-hidden>
        Mantén presionado para {etiqueta}
      </span>
    </button>
  );
}
