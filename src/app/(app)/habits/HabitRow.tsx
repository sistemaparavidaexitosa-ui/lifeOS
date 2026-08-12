"use client";

import { useTransition } from "react";
import { toggleHabitToday } from "./actions";

interface OccupationLite {
  id: string;
  title: string;
}

export default function HabitRow({
  habit,
  doneToday,
  streak,
  occupation
}: {
  habit: { id: string; name: string; frequency: string; category: string };
  doneToday: boolean;
  streak: number;
  occupation: OccupationLite | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
      <button
        className="w-8.5 h-8.5 rounded-full grid place-items-center flex-shrink-0"
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
      <div className="grow">
        <b>{habit.name}</b>
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          {habit.frequency} · {habit.category}
          {occupation ? ` · ligado a ${occupation.title}` : ""}
        </div>
      </div>
      <span className={`chip ${streak > 0 ? "ok" : ""}`}>{streak} día(s) de racha</span>
    </div>
  );
}
