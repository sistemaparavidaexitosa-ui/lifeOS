"use client";

import { useState, useTransition } from "react";
import { setNavMode } from "@/lib/ritual/actions";
import { EVENTO_ABRIR_CENTRO } from "./eventos";

/**
 * Volver a la navegación premium (D-166). Vive en Home porque es donde se
 * prometió que estaría el camino de vuelta.
 *
 * Avisa al anfitrión con un EVENTO DEL NAVEGADOR y no con una prop: los dos
 * viven en ramas distintas del árbol —esta tarjeta dentro de la página, el
 * anfitrión en el layout— y un evento los deja sin conocerse.
 */
export default function ActivarPremium() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div className="grow" style={{ minWidth: 200 }}>
        <b>Navegación premium</b>
        <p className="text-xs" style={{ color: "var(--muted)", margin: 0 }}>
          Un centro tranquilo con lo que toca ahora y todos tus módulos a un toque.
        </p>
      </div>
      <button
        className="btn-primary btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await setNavMode("premium");
            if (!r.ok) {
              setError(r.reason ?? "No se pudo activar.");
              return;
            }
            setError(null);
            window.dispatchEvent(new Event(EVENTO_ABRIR_CENTRO));
          })
        }
      >
        Activar
      </button>
      {error && (
        <span className="text-xs" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
