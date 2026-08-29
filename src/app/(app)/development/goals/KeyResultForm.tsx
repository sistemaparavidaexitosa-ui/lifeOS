"use client";

import { useState, useTransition } from "react";
import { upsertKeyResult, deleteKeyResult } from "./actions";
import FormSheet, { Field, FormActions } from "../FormSheet";

export interface SourceOption {
  id: string;
  label: string;
}

export interface SourceOptions {
  habit: SourceOption[];
  project: SourceOption[];
  book: SourceOption[];
  financial_goal: SourceOption[];
  savings_goal: SourceOption[];
}

const KIND_LABEL: Record<keyof SourceOptions | "manual", string> = {
  habit: "Hábito (% de cumplimiento a 30 días)",
  project: "Proyecto personal (% de tareas hechas)",
  book: "Libro (páginas leídas)",
  financial_goal: "Meta financiera (monto acumulado)",
  savings_goal: "Ahorro (monto acumulado)",
  manual: "Captura manual"
};

interface KeyResultLite {
  id: string;
  title: string;
  sourceKind: string;
  sourceId: string | null;
  target: number;
  manualCurrent: number;
  unit: string;
}

export default function KeyResultForm({
  goalId,
  kr,
  sources,
  block = false
}: {
  goalId: string;
  kr?: KeyResultLite;
  sources: SourceOptions;
  block?: boolean;
}) {
  return (
    <FormSheet
      label={kr ? "Editar" : "+ Resultado clave"}
      title={kr ? "Editar resultado clave" : "Nuevo resultado clave"}
      block={block}
    >
      {(close) => <KeyResultFields goalId={goalId} kr={kr} sources={sources} close={close} />}
    </FormSheet>
  );
}

function KeyResultFields({
  goalId,
  kr,
  sources,
  close
}: {
  goalId: string;
  kr?: KeyResultLite;
  sources: SourceOptions;
  close: () => void;
}) {
  const [kind, setKind] = useState(kr?.sourceKind ?? "manual");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const options = kind === "manual" ? [] : sources[kind as keyof SourceOptions];

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await upsertKeyResult(goalId, kr?.id ?? null, fd);
            setError(null);
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      className="flex flex-col gap-3"
    >
      <Field label="Resultado clave">
        <input name="title" placeholder="Ej. libros terminados" defaultValue={kr?.title} required />
      </Field>

      <Field label="¿De dónde sale el número?">
        <select name="sourceKind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>

      {kind === "manual" ? (
        <Field label="Avance actual">
          <input name="manualCurrent" type="number" step="any" min={0} defaultValue={kr?.manualCurrent ?? 0} />
        </Field>
      ) : (
        <Field label="Fuente">
          <select name="sourceId" defaultValue={kr?.sourceId ?? ""} required>
            <option value="">— elige la fuente —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {options.length === 0 && <span className="text-xs">Todavía no tienes nada de este tipo que medir.</span>}
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Meta">
          <input name="target" type="number" step="any" min={0} defaultValue={kr?.target ?? 0} required />
        </Field>
        <Field label="Unidad">
          <input name="unit" placeholder="libros, %, pesos…" defaultValue={kr?.unit ?? ""} />
        </Field>
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        El avance no se teclea: se lee de la fuente que elijas. La captura manual es solo para lo que no vive en LifeOS.
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
          kr
            ? () =>
                startTransition(async () => {
                  try {
                    await deleteKeyResult(kr.id);
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
