"use client";

import { useState, useTransition } from "react";
import FormSheet, { Field, FormActions } from "../FormSheet";
import { upsertWeight } from "./actions";

/**
 * El peso de hoy. Un `upsert` por (usuario, día): pesarse dos veces la misma
 * mañana no son dos datos, es el mismo corregido.
 */
/** El panel lo abre este componente; la página no puede pasar la función hija. */
export default function WeightForm({ actual }: { actual: number | null }) {
  return (
    <FormSheet label="Anotar peso" title="Peso de hoy">
      {(close) => <WeightFields actual={actual} close={close} />}
    </FormSheet>
  );
}

function WeightFields({ actual, close }: { actual: number | null; close: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await upsertWeight(fd);
          if (!result.ok) {
            setError(result.reason ?? "No se pudo guardar.");
            return;
          }
          close();
        })
      }
      className="flex flex-col gap-3"
    >
      <Field label="Peso de hoy (kg)">
        <input name="weightKg" type="number" min="25" max="400" step="0.1" required defaultValue={actual ?? ""} />
      </Field>
      <Field label="Grasa corporal % (opcional)">
        <input name="bodyFatPct" type="number" min="2" max="70" step="0.1" />
      </Field>
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        La tendencia se calcula promediando tres días en cada extremo, no restando dos básculas: el peso diario
        oscila por agua y sal.
      </div>

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <FormActions pending={pending} onCancel={close} />
    </form>
  );
}
