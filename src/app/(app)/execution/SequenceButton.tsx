"use client";
// Sugerencia de secuencia (IA explicable). El resultado se muestra en el
// Drawer lateral (.td-*), no debajo del botón.
//
// FIX (móvil): la sugerencia era una `.card` renderizada dentro del propio
// componente, y el componente vive en `.ex-header-actions`, que es un flex con
// `justify-content: flex-end`. Al llegar el resultado, la tarjeta se convertía
// en un ítem flex más de esa fila: en un móvil quedaba estrujada contra el
// borde derecho, con la lista ordenada y el bloque de supuestos dentro. El
// Drawer la saca del flujo y en móvil sube como hoja a pantalla casi completa.

import { useState, useTransition } from "react";
import { requestProjectSequence, applyProjectSequence } from "./actions";
import { IconClose } from "@/components/icons";

interface TaskLite {
  id: string;
  title: string;
}

export default function SequenceButton({ projectId, tasks }: { projectId: string; tasks: TaskLite[] }) {
  const [suggestion, setSuggestion] = useState<Awaited<ReturnType<typeof requestProjectSequence>> | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t.title]));

  return (
    <>
      <button
        type="button"
        className="btn-ghost btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              setSuggestion(await requestProjectSequence(projectId));
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo calcular la secuencia");
            }
          })
        }
      >
        ✨ {pending && !suggestion ? "Calculando…" : "Sugerir secuencia"}
      </button>

      {error && <span className="mb-inline-error text-xs">{error}</span>}

      {suggestion && (
        <>
          <div className="td-backdrop" onClick={() => setSuggestion(null)} />
          <aside className="td-drawer" role="dialog" aria-modal="true" aria-label="Secuencia sugerida">
            <div className="td-drawer-header">
              <b className="td-drawer-title">Secuencia sugerida</b>
              <button type="button" className="td-drawer-close" onClick={() => setSuggestion(null)} aria-label="Cerrar">
                <IconClose />
              </button>
            </div>
            <div className="td-drawer-body">
              {suggestion.order.length === 0 ? (
                <p className="text-sm">No hay tareas activas en este proyecto para secuenciar.</p>
              ) : (
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
                    Supuestos: {suggestion.assumptions.join(" ")} Esto es una recomendación explicable; no reordena nada
                    hasta que la aceptes (BR-022, FR-INT-008).
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost btn-sm w-full sm:w-auto"
                      onClick={() => setSuggestion(null)}
                    >
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
                            setSuggestion(null);
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
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
