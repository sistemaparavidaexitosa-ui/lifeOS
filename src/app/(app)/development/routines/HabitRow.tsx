"use client";

import { useTransition, type ReactNode } from "react";
import { toggleHabitToday } from "./actions";

/**
 * Fila de hábito. En móvil la racha ya no compite por la primera línea con el
 * nombre: baja junto a la duración y la categoría, que es donde se lee como
 * un dato más del hábito. El nombre puede ser largo — `min-w-0` es lo que
 * impide que empuje el botón de marcar fuera de la pantalla.
 */
export default function HabitRow({
  routineId,
  habit,
  doneToday,
  streak,
  action
}: {
  routineId: string;
  habit: {
    id: string;
    name: string;
    category: string;
    durationMin: number;
    /** «Después de X…» — la intención de implementación (migración 0033). */
    cue: string;
    twoMinVersion: string;
    /** Nombre del hábito ancla, ya resuelto en el servidor. */
    stackAfterName: string | null;
  };
  doneToday: boolean;
  streak: number;
  /** Botón de edición: viaja desde el Server Component para vivir en la fila. */
  action?: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const streakChip = (
    <span className={`chip ${streak > 0 ? "ok" : ""}`}>
      {streak} día{streak === 1 ? "" : "s"} de racha
    </span>
  );

  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
      <button
        className="rounded-full grid place-items-center flex-shrink-0"
        style={{
          width: 34,
          height: 34,
          border: `2px solid ${doneToday ? "var(--ok)" : "var(--line)"}`,
          background: doneToday ? "var(--ok)" : "transparent",
          color: doneToday ? "#fff" : "inherit"
        }}
        disabled={pending}
        onClick={() => startTransition(() => toggleHabitToday(routineId, habit.id))}
        aria-label={doneToday ? "Marcar como no cumplido" : "Marcar como cumplido"}
      >
        {doneToday ? "✓" : ""}
      </button>

      <div className="grow min-w-0 flex flex-col gap-1">
        <b style={{ overflowWrap: "anywhere" }}>{habit.name}</b>

        {/* La señal se pinta bajo el nombre y no en el formulario, porque su
            trabajo es recordarte CUÁNDO toca — encerrada en la pantalla de
            edición no la lee nadie, y entonces las tres columnas de la
            migración 0033 no habrían servido para nada. */}
        {(habit.stackAfterName || habit.cue) && (
          <span className="hb-cue">
            {habit.stackAfterName ? `Después de: ${habit.stackAfterName}` : habit.cue}
          </span>
        )}

        {/* Solo cuando aún no está hecho: una vez marcado, ofrecer la salida
            de emergencia sobra y solo añade ruido a la fila. */}
        {!doneToday && habit.twoMinVersion && (
          <span className="hb-two">Si hoy no puedes: {habit.twoMinVersion}</span>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
            {habit.durationMin} min · {habit.category}
          </span>
          <span className="sm:hidden">{streakChip}</span>
        </div>
      </div>

      <span className="hidden sm:block flex-shrink-0">{streakChip}</span>
      {action && <span className="flex-shrink-0">{action}</span>}
    </div>
  );
}
