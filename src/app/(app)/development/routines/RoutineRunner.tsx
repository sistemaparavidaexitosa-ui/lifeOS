"use client";

import type { ReactNode } from "react";
import HabitRow from "./HabitRow";
import type { HabitLogEntry } from "@/lib/domain/development/habit-analytics.ts";

export interface RunnerHabit {
  id: string;
  name: string;
  category: string;
  /** Si el hábito ES una comida (0047), su nombre. `null` si no lo es. */
  meal?: string | null;
  durationMin: number;
  cue: string;
  twoMinVersion: string;
  stackAfterName: string | null;
  /** El registro de hoy en cualquier estado (0063), o `null`. */
  todayEntry: HabitLogEntry | null;
  /** Hábito semanal cumplido otro día de esta semana. */
  weekDoneElsewhere: boolean;
  streak: number;
  streakUnit: "día" | "semana";
  /** Registros de la última semana, para la hoja de detalle. */
  recent: HabitLogEntry[];
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
  today,
  minDate
}: {
  routineId: string;
  habits: RunnerHabit[];
  today: string;
  /** Primer día que se puede registrar con detalle. */
  minDate: string;
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
            stackAfterName: h.stackAfterName,
            meal: h.meal
          }}
          todayEntry={h.todayEntry}
          weekDoneElsewhere={h.weekDoneElsewhere}
          streak={h.streak}
          streakUnit={h.streakUnit}
          today={today}
          minDate={minDate}
          recent={h.recent}
          action={h.action}
        />
      ))}
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        Ejecución del {today}.
      </p>
    </div>
  );
}
