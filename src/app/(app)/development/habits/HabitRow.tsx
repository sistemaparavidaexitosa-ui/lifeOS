"use client";

import { useTransition, type ReactNode } from "react";
import { toggleHabitToday } from "./actions";

interface OccupationLite {
  id: string;
  title: string;
}

/**
 * Fila de hábito. En móvil la racha ya no compite por la primera línea con el
 * nombre: baja junto a la frecuencia y la categoría, que es donde se lee como
 * un dato más del hábito. El nombre puede ser largo — `min-w-0` es lo que
 * impide que empuje el botón de marcar fuera de la pantalla.
 */
export default function HabitRow({
  habit,
  doneToday,
  streak,
  occupation,
  action
}: {
  habit: { id: string; name: string; frequency: string; category: string };
  doneToday: boolean;
  streak: number;
  occupation: OccupationLite | null;
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
        onClick={() => startTransition(() => toggleHabitToday(habit.id))}
        aria-label={doneToday ? "Marcar como no cumplido" : "Marcar como cumplido"}
      >
        {doneToday ? "✓" : ""}
      </button>

      <div className="grow min-w-0 flex flex-col gap-1">
        <b style={{ overflowWrap: "anywhere" }}>{habit.name}</b>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
            {habit.frequency} · {habit.category}
            {occupation ? ` · ligado a ${occupation.title}` : ""}
          </span>
          <span className="sm:hidden">{streakChip}</span>
        </div>
      </div>

      <span className="hidden sm:block flex-shrink-0">{streakChip}</span>
      {action && <span className="flex-shrink-0">{action}</span>}
    </div>
  );
}
