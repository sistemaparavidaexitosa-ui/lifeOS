"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptProposal, dismissProposal } from "@/lib/coach/actions";
import type { SugerenciaView } from "@/lib/centro/sugerencias";

/**
 * «Lo siguiente»: lo que la IA propone en el centro (D-167).
 *
 * LA IA NO ESCRIBE NADA POR SU CUENTA (D-153). Estos botones son la puerta:
 * aceptar una de `foco` solo navega; aceptar una que crea algo llama a
 * `acceptProposal`, que a su vez llama a la Server Action real de tarea o de
 * bloque. Aquí no se escribe en ninguna tabla a mano.
 *
 * Lo descartado desaparece de la lista y no vuelve — la mitad del valor está
 * ahí: una IA que repite lo que ya rechazaste deja de leerse.
 */
export default function Sugerencias({
  iniciales,
  workspaceId,
  onNavegar
}: {
  iniciales: SugerenciaView[];
  /** Donde se crean las tareas. `null` si la cuenta no tiene espacio personal. */
  workspaceId: string | null;
  /** Se llama antes de navegar, para que el centro se cierre. */
  onNavegar: () => void;
}) {
  const [lista, setLista] = useState(iniciales);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  if (lista.length === 0) return null;

  function aceptar(s: SugerenciaView) {
    setPendiente(s.id);
    startTransition(async () => {
      const r = await acceptProposal(s.id, workspaceId);
      setPendiente(null);
      if (!r.ok) {
        setError(r.reason ?? "No se pudo.");
        return;
      }
      setError(null);
      setLista((l) => l.filter((x) => x.id !== s.id));
      if (r.href) {
        onNavegar();
        router.push(r.href);
      }
    });
  }

  function descartar(s: SugerenciaView) {
    setPendiente(s.id);
    startTransition(async () => {
      const r = await dismissProposal(s.id);
      setPendiente(null);
      if (!r.ok) {
        setError(r.reason ?? "No se pudo.");
        return;
      }
      setError(null);
      setLista((l) => l.filter((x) => x.id !== s.id));
    });
  }

  return (
    <div>
      <p className="rit-eyebrow">Lo siguiente</p>
      <ul className="rit-sug-lista">
        {lista.map((s) => (
          <li key={s.id} className="rit-sug">
            <div className="min-w-0">
              <p className="rit-lead" style={{ margin: 0 }}>
                {s.titulo}
              </p>
              {(s.motivo || s.detalle) && <p className="rit-muted">{s.motivo || s.detalle}</p>}
            </div>
            <div className="rit-sug-botones">
              <button className="rit-sug-si" disabled={pendiente === s.id} onClick={() => aceptar(s)}>
                {s.tipo === "foco" ? "Ir" : "Añadir"}
              </button>
              <button className="rit-skip" disabled={pendiente === s.id} onClick={() => descartar(s)}>
                No
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p className="rit-muted" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
