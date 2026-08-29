"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toggleRoutineStep } from "./actions";

export interface RunnerStep {
  id: string;
  title: string;
  durationMin: number;
  habitName: string | null;
  /** Botón de edición del paso; llega ya renderizado desde el servidor. */
  action?: ReactNode;
}

/**
 * `today` llega como prop desde el Server Component (D-018): el cliente nunca
 * calcula la fecha, porque la fecha correcta es la de la zona horaria del
 * perfil, no la del navegador.
 */
export default function RoutineRunner({
  routineId,
  steps,
  completedStepIds,
  today
}: {
  routineId: string;
  steps: RunnerStep[];
  completedStepIds: string[];
  today: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = new Set(completedStepIds);

  if (!steps.length) {
    return (
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        Esta rutina todavía no tiene pasos.
      </p>
    );
  }

  return (
    <div className="mt-2.5 flex flex-col">
      {steps.map((s) => (
        // El botón de editar NO puede ir dentro del <label>: tocarlo marcaría
        // el paso. Por eso la fila es un div y el label envuelve solo la casilla
        // y el texto — que es, además, un área táctil grande y cómoda.
        <div key={s.id} className="flex items-center gap-2 py-1" style={{ borderTop: "1px solid var(--line)" }}>
          <label className="flex items-start gap-2.5 grow min-w-0 cursor-pointer py-1.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={done.has(s.id)}
              disabled={pending}
              onChange={() =>
                startTransition(async () => {
                  try {
                    await toggleRoutineStep(routineId, s.id);
                    setError(null);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
                })
              }
            />
            <span className="grow min-w-0">
              <span
                className="block text-sm"
                style={{
                  overflowWrap: "anywhere",
                  textDecoration: done.has(s.id) ? "line-through" : undefined,
                  color: done.has(s.id) ? "var(--muted)" : undefined
                }}
              >
                {s.title}
              </span>
              {/* La duración y el hábito bajan a su propia línea: en móvil
                  competían con el título por el ancho y lo partían en dos. */}
              <span className="block text-xs" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
                {s.durationMin} min{s.habitName ? ` · hábito: ${s.habitName}` : ""}
              </span>
            </span>
          </label>
          {s.action && <span className="flex-shrink-0">{s.action}</span>}
        </div>
      ))}
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        Ejecución del {today}. Desmarcar un paso no borra la racha del hábito.
      </p>
      {error && (
        <div className="text-xs mt-1" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
