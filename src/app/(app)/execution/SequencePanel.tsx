"use client";
// Secuencia sugerida (IA explicable) — contenido del panel, sin disparador.
//
// POR QUÉ YA NO ES UN BOTÓN
// "✨ Sugerir secuencia" vivía como botón propio en la cabecera del proyecto,
// junto al "⋯". Eran dos controles compitiendo por la misma esquina y el más
// ancho con diferencia: una acción ocasional ocupando permanentemente el sitio
// de las acciones del proyecto y estirando esa fila. Ahora es una entrada más
// del menú "⋯", que es donde ya viven editar, bitácora y conocimiento, y su
// resultado se pinta en el mismo Drawer que ellas.
//
// Este archivo, por tanto, ya no monta ni backdrop ni <aside>: ProjectMenu lo
// hace una sola vez para sus cuatro paneles.

import { useEffect, useState, useTransition } from "react";
import { requestProjectSequence, applyProjectSequence } from "./actions";

interface TaskLite {
  id: string;
  title: string;
}

type Suggestion = Awaited<ReturnType<typeof requestProjectSequence>>;

export default function SequencePanel({
  projectId,
  tasks,
  onClose
}: {
  projectId: string;
  tasks: TaskLite[];
  onClose: () => void;
}) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t.title]));

  // Se pide al abrir el panel: llegar hasta aquí desde el menú ya es la
  // intención de verla, un segundo clic para "calcular" sobraba.
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        const result = await requestProjectSequence(projectId);
        if (!cancelled) setSuggestion(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo calcular la secuencia");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) {
    return (
      <div className="text-sm" style={{ color: "var(--danger)" }}>
        {error}
      </div>
    );
  }

  if (!suggestion) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Calculando la secuencia…
      </p>
    );
  }

  if (suggestion.order.length === 0) {
    return <p className="text-sm">No hay tareas activas en este proyecto para secuenciar.</p>;
  }

  return (
    <>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Confianza: {suggestion.confidence}. Evidencia: {suggestion.evidence.map((e) => e.label).join(", ")}.
      </p>

      <ol className="flex flex-col gap-2">
        {suggestion.order.map((id, idx) => (
          <li key={id} className="flex items-start gap-2 text-sm">
            <span className="chip accent flex-shrink-0">{idx + 1}</span>
            <span className="min-w-0" style={{ overflowWrap: "anywhere" }}>
              {byId[id] ?? id}
            </span>
          </li>
        ))}
      </ol>

      <div
        className="text-xs p-2.5 rounded-r-xl"
        style={{
          background: "color-mix(in srgb, var(--purple) 9%, var(--surface))",
          borderLeft: "3px solid var(--purple)"
        }}
      >
        Supuestos: {suggestion.assumptions.join(" ")} Esto es una recomendación explicable; no reordena nada hasta que la
        aceptes (BR-022, FR-INT-008).
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
        <button type="button" className="btn-ghost btn-sm w-full sm:w-auto" onClick={onClose}>
          Descartar
        </button>
        <span className="hidden sm:block grow" />
        <button
          type="button"
          className="btn-primary btn-sm w-full sm:w-auto"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await applyProjectSequence(projectId, suggestion.order);
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : "No se pudo aplicar la secuencia");
              }
            })
          }
        >
          {pending ? "Aplicando…" : "Aceptar secuencia"}
        </button>
      </div>
    </>
  );
}
