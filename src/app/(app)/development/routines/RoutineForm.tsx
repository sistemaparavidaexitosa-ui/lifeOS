"use client";

import { useState, useTransition } from "react";
import { upsertRoutine, deleteRoutine } from "./actions";
import FormSheet, { Field, FormActions } from "../FormSheet";

export interface OccupationLite {
  id: string;
  title: string;
  start: string;
  end: string;
}

const FRECUENCIAS = ["Diario", "Semanal", "Entre semana", "Fin de semana"] as const;

interface RoutineLite {
  id: string;
  name: string;
  frequency: string;
  occupationId: string | null;
  identity: string;
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

      <Field label="¿En quién te conviertes al sostenerla?">
        <input
          name="identity"
          placeholder="Ej. soy alguien que no negocia sus mañanas"
          defaultValue={routine?.identity ?? ""}
          maxLength={160}
          autoCapitalize="sentences"
        />
      </Field>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Opcional, y lo más útil del formulario. Una rutina se abandona cuando compite con quien crees que eres, y se
        sostiene cuando lo confirma.
      </p>

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
