"use client";

import { useState, useTransition } from "react";
import { upsertHabit, deleteHabit } from "./actions";
import FormSheet, { Field, FormActions } from "../FormSheet";

export interface HabitLite {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  cue: string;
  twoMinVersion: string;
  stackAfterHabitId: string | null;
}

/** Otros hábitos del usuario: los candidatos sobre los que apilar este. */
export interface HabitOption {
  id: string;
  name: string;
}

/**
 * Valores con los que abre el formulario cuando viene de una plantilla. La
 * plantilla PRELLENA, no crea: la señal es personal («después de *mi* café») y
 * tiene que poder editarse antes de guardar, o se guarda una frase que no
 * significa nada para quien la va a seguir.
 */
export interface HabitPrefill {
  name: string;
  category: string;
  cue: string;
  twoMinVersion: string;
}

export default function HabitForm({
  routineId,
  habit,
  otherHabits = [],
  prefill,
  label,
  position = 0
}: {
  routineId: string;
  habit?: HabitLite;
  otherHabits?: HabitOption[];
  prefill?: HabitPrefill;
  label?: string;
  /** Posición por defecto de un hábito nuevo: el final de la rutina. */
  position?: number;
}) {
  return (
    <FormSheet
      label={label ?? (habit ? "Editar" : "+ Hábito")}
      title={habit ? "Editar hábito" : "Nuevo hábito"}
      variant={habit ? "ghost" : "primary"}
    >
      {(close) => (
        <HabitFields
          routineId={routineId}
          habit={habit}
          otherHabits={otherHabits}
          prefill={prefill}
          position={position}
          close={close}
        />
      )}
    </FormSheet>
  );
}

export function HabitFields({
  routineId,
  habit,
  otherHabits,
  prefill,
  position,
  close
}: {
  routineId: string;
  habit?: HabitLite;
  otherHabits: HabitOption[];
  prefill?: HabitPrefill;
  position: number;
  close: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await upsertHabit(routineId, habit?.id ?? null, fd);
            setError(null);
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      className="flex flex-col gap-3"
    >
      <Field label="Nombre del hábito">
        <input name="name" placeholder="Ej. leer 20 minutos" defaultValue={habit?.name ?? prefill?.name} required />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Categoría">
          <select name="category" defaultValue={habit?.category ?? prefill?.category ?? "Salud"}>
            <option>Salud</option>
            <option>Aprendizaje</option>
            <option>Trabajo</option>
            <option>Personal</option>
            <option>Otros</option>
          </select>
        </Field>
        <Field label="Minutos">
          <input name="durationMin" type="number" min={1} defaultValue={habit?.durationMin ?? 5} required />
        </Field>
      </div>

      <Field label="Orden dentro de la rutina">
        <input name="position" type="number" min={0} defaultValue={position} />
      </Field>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        El orden ES el apilamiento: cada hábito se dispara después del anterior.
      </p>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        La frecuencia y el bloque horario los pone la rutina: este hábito toca cuando toca ella.
      </p>

      {/* Los tres campos de «Hábitos atómicos» (migración 0033). Van juntos y
          al final porque son los que se piensan, no los que se teclean: el
          nombre y la frecuencia salen solos, la señal hay que decidirla. */}
      <div className="ah-block">
        <b className="text-sm">Para que se sostenga</b>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Un hábito sin momento no se ejecuta: se recuerda con culpa por la noche.
        </p>

        <Field label="¿Después de qué? (la señal)">
          <input
            name="cue"
            placeholder="Ej. después de servirme el café"
            defaultValue={habit?.cue ?? prefill?.cue ?? ""}
            maxLength={240}
            autoCapitalize="sentences"
          />
        </Field>

        <Field label="Versión de dos minutos">
          <input
            name="twoMinVersion"
            placeholder="Ej. leer una página"
            defaultValue={habit?.twoMinVersion ?? prefill?.twoMinVersion ?? ""}
            maxLength={240}
            autoCapitalize="sentences"
          />
        </Field>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          La versión que harías incluso en un día pésimo. Es la que sostiene la racha.
        </p>

        {otherHabits.length > 0 && (
          <Field label="Apilar sobre un hábito que ya tienes">
            <select name="stackAfterHabitId" defaultValue={habit?.stackAfterHabitId ?? ""}>
              <option value="">— sin apilar —</option>
              {otherHabits
                .filter((h) => h.id !== habit?.id)
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
      </div>
      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <FormActions
        pending={pending}
        onCancel={close}
        onDelete={
          habit
            ? () =>
                startTransition(async () => {
                  try {
                    await deleteHabit(habit.id);
                    close();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
                })
            : undefined
        }
      />
    </form>
  );
}
