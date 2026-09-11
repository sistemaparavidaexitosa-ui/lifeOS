"use client";

import { useState, useTransition } from "react";
import { setProjectDeps } from "./actions";

// De qué proyectos depende este. Mismo patrón que DepsField (el de tareas),
// con una diferencia que se nota: aquí el error se PINTA, porque el fallo
// esperable no es un dato mal capturado sino un ciclo, y un ciclo hay que
// explicarlo para que se pueda deshacer.

interface Hermano {
  id: string;
  title: string;
  status: string;
}

export default function ProjectDepsField({
  projectId,
  candidates,
  selected
}: {
  projectId: string;
  candidates: Hermano[];
  selected: string[];
}) {
  const [checked, setChecked] = useState<string[]>(selected);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function alternar(id: string) {
    const siguiente = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
    setChecked(siguiente);
    setGuardado(false);
    startTransition(async () => {
      const r = await setProjectDeps(projectId, siguiente);
      if (r.ok) {
        setError(null);
        setGuardado(true);
      } else {
        // Se revierte la casilla: dejarla marcada después de un ciclo
        // rechazado haría creer que se guardó.
        setChecked(checked);
        setError(r.reason ?? "No se pudo guardar.");
      }
    });
  }

  return (
    <div className="card" style={{ background: "var(--surface)", marginTop: 8 }}>
      <b className="text-sm">Depende de</b>
      <div className="text-xs" style={{ color: "var(--muted)", margin: "4px 0 8px" }}>
        Qué proyectos tienen que avanzar antes que este. Se dibujan en el Mapa de dependencias.
      </div>

      {candidates.length === 0 && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          No hay otros proyectos en este espacio.
        </div>
      )}

      {candidates.map((p) => (
        <label key={p.id} className="row sm" style={{ margin: "4px 0", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={checked.includes(p.id)}
            onChange={() => alternar(p.id)}
            disabled={pending}
            style={{ width: "auto" }}
          />
          <span>
            {p.title} <span style={{ color: "var(--muted)" }}>({p.status})</span>
          </span>
        </label>
      ))}

      {error && <div className="chip danger" style={{ marginTop: 8 }}>{error}</div>}
      {guardado && !error && (
        <div className="text-xs" style={{ color: "var(--ok)", marginTop: 8 }}>Guardado.</div>
      )}
    </div>
  );
}
