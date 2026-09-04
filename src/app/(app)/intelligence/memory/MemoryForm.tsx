"use client";

import { useState, useTransition } from "react";
import { deleteMemoryItem, upsertMemoryItem } from "@/lib/insights/actions";
import type { MemoryScope } from "@/lib/domain/insights/memory.ts";

const SCOPES: [MemoryScope, string][] = [
  ["decision", "Decisión"],
  ["preference", "Preferencia"],
  ["health", "Salud"],
  ["finance", "Finanzas"],
  ["goal", "Meta"],
  ["project", "Proyecto"],
  ["time", "Tiempo"],
  ["habit", "Hábito"]
];

export default function MemoryForm({
  item
}: {
  item?: { id: string; scope: MemoryScope; text: string; validUntil: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className={item ? "btn-ghost btn-sm mt-2" : "btn-primary btn-sm"} onClick={() => setOpen(true)}>
        {item ? "Editar" : "+ Nota"}
      </button>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const res = await upsertMemoryItem(item?.id ?? null, fd);
          if (res.ok) {
            setError(null);
            setOpen(false);
          } else setError(res.reason ?? "No se pudo guardar.");
        })
      }
      className="flex flex-col gap-2 mt-2"
    >
      <textarea name="text" defaultValue={item?.text} rows={2} placeholder="Lo que el motor debe tener en cuenta…" required />
      <div className="grid grid-cols-2 gap-2">
        <select name="scope" defaultValue={item?.scope ?? "decision"}>
          {SCOPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input name="validUntil" type="date" defaultValue={item?.validUntil ?? ""} title="Vigente hasta (opcional)" />
      </div>
      {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
      <div className="flex gap-2">
        {item && (
          <button
            type="button"
            className="btn-danger btn-sm"
            disabled={pending}
            onClick={() => startTransition(async () => { await deleteMemoryItem(item.id); setOpen(false); })}
          >
            Eliminar
          </button>
        )}
        <span className="grow" />
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cerrar
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
