"use client";

import { useState, useTransition } from "react";
import { upsertRoutine, deleteRoutine, upsertRoutineStep, deleteRoutineStep } from "./actions";
import FormSheet, { Field, FormActions } from "../FormSheet";

export interface OccupationLite {
  id: string;
  title: string;
  start: string;
  end: string;
}

export interface HabitLite {
  id: string;
  name: string;
}

const FRECUENCIAS = ["Diario", "Semanal", "Entre semana", "Fin de semana"] as const;

interface RoutineLite {
  id: string;
  name: string;
  frequency: string;
  occupationId: string | null;
  active: boolean;
}

export default function RoutineForm({
  routine,
  occupations
}: {
  routine?: RoutineLite;
  occupations: OccupationLite[];
}) {
  return (
    <FormSheet
      label={routine ? "Editar" : "+ Rutina"}
      title={routine ? "Editar rutina" : "Nueva rutina"}
      variant={routine ? "ghost" : "primary"}
    >
      {(close) => <RoutineFields routine={routine} occupations={occupations} close={close} />}
    </FormSheet>
  );
}

function RoutineFields({
  routine,
  occupations,
  close
}: {
  routine?: RoutineLite;
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
            await upsertRoutine(routine?.id ?? null, fd);
            setError(null);
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      className="flex flex-col gap-3"
    >
      <Field label="Nombre de la rutina">
        <input name="name" placeholder="Ej. arranque de la mañana" defaultValue={routine?.name} required />
      </Field>

      <Field label="Frecuencia">
        <select name="frequency" defaultValue={routine?.frequency ?? "Diario"}>
          {FRECUENCIAS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Field>

      <Field label="Bloque de Autogestión del Tiempo">
        <select name="occupationId" defaultValue={routine?.occupationId ?? ""}>
          <option value="">— sin anclar a un bloque —</option>
          {occupations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title} ({o.start}–{o.end})
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-center gap-2.5 text-sm cursor-pointer">
        <input type="checkbox" name="active" defaultChecked={routine?.active ?? true} />
        Activa
      </label>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        El horario vive en Autogestión del Tiempo: la rutina solo se ancla a un bloque que ya existe (BR-026).
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
          routine
            ? () =>
                startTransition(async () => {
                  try {
                    await deleteRoutine(routine.id);
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

interface StepLite {
  id: string;
  title: string;
  durationMin: number;
  habitId: string | null;
  position: number;
}

export function StepForm({
  routineId,
  step,
  position,
  habits,
  block = false
}: {
  routineId: string;
  step?: StepLite;
  position: number;
  habits: HabitLite[];
  block?: boolean;
}) {
  return (
    <FormSheet label={step ? "Editar" : "+ Paso"} title={step ? "Editar paso" : "Nuevo paso"} block={block}>
      {(close) => <StepFields routineId={routineId} step={step} position={position} habits={habits} close={close} />}
    </FormSheet>
  );
}

function StepFields({
  routineId,
  step,
  position,
  habits,
  close
}: {
  routineId: string;
  step?: StepLite;
  position: number;
  habits: HabitLite[];
  close: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await upsertRoutineStep(routineId, step?.id ?? null, fd);
            setError(null);
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      className="flex flex-col gap-3"
    >
      <Field label="Paso">
        <input name="title" placeholder="Ej. Meditar 10 min" defaultValue={step?.title} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Minutos">
          <input name="durationMin" type="number" min={1} defaultValue={step?.durationMin ?? 5} required />
        </Field>
        <Field label="Orden">
          <input name="position" type="number" min={0} defaultValue={step?.position ?? position} />
        </Field>
      </div>

      <Field label="Hábito ligado">
        <select name="habitId" defaultValue={step?.habitId ?? ""}>
          <option value="">— sin ligar —</option>
          {habits.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </Field>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Si ligas el paso a un hábito, completarlo aquí marca ese hábito de hoy: la racha no se bifurca.
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
          step
            ? () =>
                startTransition(async () => {
                  try {
                    await deleteRoutineStep(step.id);
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
