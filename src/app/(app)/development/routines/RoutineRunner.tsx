"use client";

import { useState, useTransition } from "react";
import { toggleRoutineStep } from "./actions";

export interface RunnerStep {
  id: string;
  title: string;
  durationMin: number;
  habitName: string | null;
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
    <div className="mt-2 flex flex-col gap-1">
      {steps.map((s) => (
        <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
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
          <span style={{ textDecoration: done.has(s.id) ? "line-through" : undefined, color: done.has(s.id) ? "var(--muted)" : undefined }}>
            {s.title}
          </span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {s.durationMin} min{s.habitName ? ` · hábito: ${s.habitName}` : ""}
          </span>
        </label>
      ))}
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Ejecución del {today}. Desmarcar un paso no borra la racha del hábito.
      </p>
      {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}
