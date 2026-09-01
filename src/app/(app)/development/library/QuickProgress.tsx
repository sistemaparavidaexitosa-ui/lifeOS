"use client";

// Avance rápido: escribir la página sin abrir el formulario del libro.
//
// POR QUÉ EXISTE
// Toda la Biblioteca calcula sobre `book_progress`: la velocidad, la fecha
// estimada de término, el aviso de estancado y el ritmo que exige el plan. Y
// hasta ahora la única forma de alimentar esa tabla era abrir "Abrir" y guardar
// seis campos. Un cálculo que nadie alimenta contesta siempre lo mismo — "sin
// datos suficientes" — así que el problema no era la fórmula, era el trámite.

import { useState, useTransition } from "react";
import { updateBookPage } from "./actions";

export default function QuickProgress({ bookId, currentPage }: { bookId: string; currentPage: number }) {
  const [pending, startTransition] = useTransition();
  const [page, setPage] = useState(String(currentPage));
  const [error, setError] = useState<string | null>(null);

  const numero = Number(page);
  // Sin cambio no hay nada que guardar: el botón apagado dice eso mejor que un
  // guardado que no hace nada y parpadea igual.
  const sinCambio = !page.trim() || !Number.isFinite(numero) || numero === currentPage;

  function guardar() {
    startTransition(async () => {
      try {
        const result = await updateBookPage(bookId, Math.trunc(numero));
        if (!result.ok) {
          setError(result.reason ?? "No se pudo guardar la página.");
          return;
        }
        setError(null);
      } catch {
        setError("No se pudo contactar al servidor. Revisa tu conexión.");
      }
    });
  }

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          value={page}
          onChange={(e) => setPage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !sinCambio && !pending) {
              e.preventDefault();
              guardar();
            }
          }}
          className="w-20 flex-shrink-0"
          aria-label="Página actual"
        />
        <button type="button" className="btn-ghost btn-sm flex-shrink-0" disabled={pending || sinCambio} onClick={guardar}>
          {pending ? "…" : "Voy aquí"}
        </button>
      </div>
      {error && (
        <div className="text-xs mt-1" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
