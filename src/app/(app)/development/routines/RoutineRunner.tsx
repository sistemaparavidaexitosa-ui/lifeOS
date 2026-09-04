"use client";

import type { ReactNode } from "react";
import HabitRow from "./HabitRow";

export interface RunnerHabit {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  cue: string;
  twoMinVersion: string;
  stackAfterName: string | null;
  doneToday: boolean;
  streak: number;
  /** Botón de edición del hábito; llega ya renderizado desde el servidor. */
  action?: ReactNode;
}

/**
 * El ejecutor ya no pinta casillas propias: pinta filas de hábito, que son las
 * mismas que se veían en /development/habits antes de 0046. Una sola forma de
 * marcar un hábito en toda la aplicación.
 *
 * `today` llega como prop desde el Server Component (D-018): el cliente nunca
 * calcula la fecha, porque la fecha correcta es la de la zona horaria del
 * perfil, no la del navegador.
 */
export default function RoutineRunner({
  routineId,
  habits,
  today
}: {
  routineId: string;
  habits: RunnerHabit[];
  today: string;
}) {
  if (!habits.length) {
    return (
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        Esta rutina todavía no tiene hábitos.
      </p>
    );
  }

  return (
    <div className="mt-2.5 flex flex-col">
      {habits.map((h) => (
        <HabitRow
          key={h.id}
          routineId={routineId}
          habit={{
            id: h.id,
            name: h.name,
            category: h.category,
            durationMin: h.durationMin,
            cue: h.cue,
            twoMinVersion: h.twoMinVersion,
            stackAfterName: h.stackAfterName
          }}
          doneToday={h.doneToday}
          streak={h.streak}
          action={h.action}
        />
      ))}
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        Ejecución del {today}.
      </p>
    </div>
  );
}
