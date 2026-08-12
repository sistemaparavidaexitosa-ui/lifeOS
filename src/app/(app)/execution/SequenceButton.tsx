"use client";

import { useState, useTransition } from "react";
import { requestProjectSequence, applyProjectSequence } from "./actions";

interface TaskLite {
  id: string;
  title: string;
}

export default function SequenceButton({ projectId, tasks }: { projectId: string; tasks: TaskLite[] }) {
  const [suggestion, setSuggestion] = useState<Awaited<ReturnType<typeof requestProjectSequence>> | null>(null);
  const [pending, startTransition] = useTransition();
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t.title]));

  return (
    <div>
      <button
        className="btn-ghost btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const s = await requestProjectSequence(projectId);
            setSuggestion(s);
          })
        }
      >
        ✨ Sugerir secuencia (IA)
      </button>

      {suggestion && (
        <div className="card mt-2" style={{ background: "var(--surface2)" }}>
          {suggestion.order.length === 0 ? (
            <p className="text-sm">No hay tareas activas en este proyecto para secuenciar.</p>
          ) : (
            <>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Confianza: {suggestion.confidence}. Evidencia: {suggestion.evidence.map((e) => e.label).join(", ")}.
              </p>
              <ol className="my-2 flex flex-col gap-1">
                {suggestion.order.map((id, idx) => (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <span className="chip accent">{idx + 1}</span> {byId[id] ?? id}
                  </li>
                ))}
              </ol>
              <div
                className="text-xs p-2 rounded-lg mb-2"
                style={{ background: "color-mix(in srgb, var(--purple) 9%, var(--surface))", borderLeft: "3px solid var(--purple)" }}
              >
                Supuestos: {suggestion.assumptions.join(" ")} Esto es una recomendación explicable; no reordena nada hasta que la
                aceptes (BR-022, FR-INT-008).
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost btn-sm" onClick={() => setSuggestion(null)}>
                  Descartar
                </button>
                <button
                  className="btn-primary btn-sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await applyProjectSequence(projectId, suggestion.order);
                      setSuggestion(null);
                    })
                  }
                >
                  Aceptar secuencia
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
