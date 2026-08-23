"use client";

import { useState, useTransition } from "react";
import { upsertKeyResult, deleteKeyResult } from "./actions";

export interface SourceOption {
  id: string;
  label: string;
}

export interface SourceOptions {
  habit: SourceOption[];
  project: SourceOption[];
  book: SourceOption[];
  financial_goal: SourceOption[];
}

const KIND_LABEL: Record<keyof SourceOptions | "manual", string> = {
  habit: "Hábito (% de cumplimiento a 30 días)",
  project: "Proyecto personal (% de tareas hechas)",
  book: "Libro (páginas leídas)",
  financial_goal: "Meta financiera (monto acumulado)",
  manual: "Captura manual"
};

export default function KeyResultForm({
  goalId,
  kr,
  sources
}: {
  goalId: string;
  kr?: { id: string; title: string; sourceKind: string; sourceId: string | null; target: number; manualCurrent: number; unit: string };
  sources: SourceOptions;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(kr?.sourceKind ?? "manual");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {kr ? "Editar" : "+ Resultado clave"}
      </button>
    );
  }

  const options = kind === "manual" ? [] : sources[kind as keyof SourceOptions];

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertKeyResult(goalId, kr?.id ?? null, fd);
              setOpen(false);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <input name="title" placeholder="Resultado clave (ej. libros terminados)" defaultValue={kr?.title} required />

        <select name="sourceKind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>

        {kind === "manual" ? (
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Avance actual
            <input name="manualCurrent" type="number" step="any" min={0} defaultValue={kr?.manualCurrent ?? 0} />
          </label>
        ) : (
          <>
            <select name="sourceId" defaultValue={kr?.sourceId ?? ""} required>
              <option value="">— elige la fuente —</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {options.length === 0 && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Todavía no tienes nada de este tipo que medir.
              </p>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Meta
            <input name="target" type="number" step="any" min={0} defaultValue={kr?.target ?? 0} required />
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Unidad
            <input name="unit" placeholder="libros, %, pesos…" defaultValue={kr?.unit ?? ""} />
          </label>
        </div>

        <p className="text-xs" style={{ color: "var(--muted)" }}>
          El avance no se teclea: se lee de la fuente que elijas. La captura manual es solo para lo que no vive en LifeOS.
        </p>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}

        <div className="flex gap-2">
          {kr && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await deleteKeyResult(kr.id);
                    setOpen(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
                })
              }
            >
              Eliminar
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={pending}>
            {pending ? "…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
