"use client";

import { useEffect, useState, type ReactNode } from "react";
import HabitCheckbox from "@/components/habits/HabitCheckbox";
import FoodSearchForm from "../nutrition/FoodSearchForm";
import HabitLogSheet from "./HabitLogSheet";
import type { Meal } from "@/lib/domain/development/nutrition.ts";
import type { HabitLogEntry } from "@/lib/domain/development/habit-analytics.ts";

/**
 * Fila de hábito. En móvil la racha ya no compite por la primera línea con el
 * nombre: baja junto a la duración y la categoría, que es donde se lee como
 * un dato más del hábito. El nombre puede ser largo — `min-w-0` es lo que
 * impide que empuje el botón de marcar fuera de la pantalla.
 */
export default function HabitRow({
  routineId,
  habit,
  todayEntry,
  weekDoneElsewhere = false,
  streak,
  streakUnit,
  today,
  minDate,
  recent,
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
    /** La comida que ES este hábito (0047), o `null` si no es una comida. */
    meal?: string | null;
  };
  /** El registro de HOY, en cualquier estado, o `null`. */
  todayEntry: HabitLogEntry | null;
  /** Hábito semanal ya cumplido otro día de esta semana. */
  weekDoneElsewhere?: boolean;
  streak: number;
  streakUnit: "día" | "semana";
  today: string;
  minDate: string;
  recent: HabitLogEntry[];
  /** Botón de edición: viaja desde el Server Component para vivir en la fila. */
  action?: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  // El registro de hoy vive también en estado local: el toque se pinta con lo
  // que devuelve la acción, sin depender de que la página se vuelva a pedir.
  // Cuando llegan props nuevas del servidor, mandan ellas.
  const [entry, setEntry] = useState<HabitLogEntry | null>(todayEntry);
  useEffect(() => {
    setEntry(todayEntry);
  }, [todayEntry?.status, todayEntry?.pct, todayEntry?.note]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneToday = entry?.status === "completed";
  const unidad = streakUnit === "semana" ? (streak === 1 ? "semana" : "semanas") : streak === 1 ? "día" : "días";
  const streakChip = (
    <span className={`chip ${streak > 0 ? "ok" : ""}`}>
      {streak} {unidad} de racha
    </span>
  );

  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
      <HabitCheckbox
        routineId={routineId}
        habitId={habit.id}
        today={today}
        entry={entry}
        onResult={(nuevo, err) => {
          setEntry(nuevo);
          setError(err);
        }}
      />

      <div className="grow min-w-0 flex flex-col gap-1">
        <b style={{ overflowWrap: "anywhere" }}>{habit.name}</b>

        {/* La señal se pinta bajo el nombre y no en el formulario, porque su
            trabajo es recordarte CUÁNDO toca — encerrada en la pantalla de
            edición no la lee nadie, y entonces las tres columnas de la
            migración 0033 no habrían servido para nada. */}
        {habit.meal && (
          // Registrar la comida marca también el hábito, pero SOLO al enviar el
          // formulario: nada se escribe por el mero hecho de que el hábito sea
          // una comida (D-089/D-105).
          <span className="hb-cue">
            <FoodSearchForm
              localDate=""
              meal={habit.meal as Meal}
              habitId={habit.id}
              label={`Registrar ${habit.meal.toLowerCase()}`}
            />
          </span>
        )}
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
          {weekDoneElsewhere && !doneToday && <span className="chip ok">Hecho esta semana</span>}
        </div>
        {entry?.note && (
          <span className="text-xs" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
            «{entry.note}»
          </span>
        )}
        {error && (
          <span className="text-xs" role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </span>
        )}
      </div>

      <span className="hidden sm:block flex-shrink-0">{streakChip}</span>
      {/* En móvil los dos botones van apilados: uno al lado del otro le
          quitaban al nombre del hábito casi un tercio de la fila. */}
      <div className="flex flex-col sm:flex-row gap-1.5 flex-shrink-0 items-end">
        <HabitLogSheet habitId={habit.id} habitName={habit.name} today={today} minDate={minDate} recent={recent} />
        {action}
      </div>
    </div>
  );
}
