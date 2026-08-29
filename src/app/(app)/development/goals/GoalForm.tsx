"use client";

import { useState, useTransition } from "react";
import { upsertPersonalGoal, deletePersonalGoal } from "./actions";
import FormSheet, { Field, FormActions } from "../FormSheet";

const AREAS = ["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"] as const;
const ESTADOS = ["Activa", "Pausada", "Lograda", "Abandonada"] as const;

interface GoalLite {
  id: string;
  title: string;
  description: string;
  area: string;
  horizon: string | null;
  status: string;
}

export default function GoalForm({ goal }: { goal?: GoalLite }) {
  return (
    <FormSheet
      label={goal ? "Editar" : "+ Meta"}
      title={goal ? "Editar meta" : "Nueva meta personal"}
      variant={goal ? "ghost" : "primary"}
    >
      {(close) => <GoalFields goal={goal} close={close} />}
    </FormSheet>
  );
}

function GoalFields({ goal, close }: { goal?: GoalLite; close: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await upsertPersonalGoal(goal?.id ?? null, fd);
            setError(null);
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      className="flex flex-col gap-3"
    >
      <Field label="¿Qué quieres lograr?">
        <input name="title" placeholder="Ej. correr 10 km sin parar" defaultValue={goal?.title} required />
      </Field>

      <textarea name="description" placeholder="Por qué importa (opcional)" defaultValue={goal?.description} rows={3} />

      {/* Los dos selects caben juntos a 360px, pero con su etiqueta encima cada
          uno pide su línea: apilados en móvil, en pareja desde `sm`. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Área">
          <select name="area" defaultValue={goal?.area ?? "Personal"}>
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select name="status" defaultValue={goal?.status ?? "Activa"}>
            {ESTADOS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Horizonte (para calcular si vas a tiempo)">
        <input name="horizon" type="date" defaultValue={goal?.horizon ?? ""} />
      </Field>

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <FormActions
        pending={pending}
        onCancel={close}
        onDelete={
          goal
            ? () =>
                startTransition(async () => {
                  try {
                    await deletePersonalGoal(goal.id);
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
