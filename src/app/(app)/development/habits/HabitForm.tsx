"use client";

import { useState, useTransition } from "react";
import { upsertHabit, deleteHabit } from "./actions";
import FormSheet, { Field, FormActions } from "../FormSheet";

interface OccupationLite {
  id: string;
  title: string;
  start: string;
  end: string;
}

interface HabitLite {
  id: string;
  name: string;
  frequency: string;
  category: string;
  occupationId: string | null;
}

export default function HabitForm({ habit, occupations }: { habit?: HabitLite; occupations: OccupationLite[] }) {
  return (
    <FormSheet
      label={habit ? "Editar" : "+ Hábito"}
      title={habit ? "Editar hábito" : "Nuevo hábito"}
      variant={habit ? "ghost" : "primary"}
    >
      {(close) => <HabitFields habit={habit} occupations={occupations} close={close} />}
    </FormSheet>
  );
}

function HabitFields({
  habit,
  occupations,
  close
}: {
  habit?: HabitLite;
  occupations: OccupationLite[];
  close: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await upsertHabit(habit?.id ?? null, fd);
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
        <input name="name" placeholder="Ej. leer 20 minutos" defaultValue={habit?.name} required />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Frecuencia">
          <select name="frequency" defaultValue={habit?.frequency ?? "Diario"}>
            <option>Diario</option>
            <option>Semanal</option>
            <option>Entre semana</option>
            <option>Fin de semana</option>
          </select>
        </Field>
        <Field label="Categoría">
          <select name="category" defaultValue={habit?.category ?? "Salud"}>
            <option>Salud</option>
            <option>Aprendizaje</option>
            <option>Trabajo</option>
            <option>Personal</option>
            <option>Otros</option>
          </select>
        </Field>
      </div>

      <Field label="Bloque de Autogestión del Tiempo">
        <select name="occupationId" defaultValue={habit?.occupationId ?? ""}>
          <option value="">— sin ligar —</option>
          {occupations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title} ({o.start}–{o.end})
            </option>
          ))}
        </select>
      </Field>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Conecta el hábito con un bloque de tu Autogestión del Tiempo (FR-HAB-001).
      </p>
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
