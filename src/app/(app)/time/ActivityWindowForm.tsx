"use client";

import { useState, useTransition } from "react";
import { updateActivityWindow } from "./actions";

export default function ActivityWindowForm({ start, end }: { start: string; end: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Editar
      </button>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await updateActivityWindow(fd);
            setError(null);
            setOpen(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      className="flex flex-col gap-2 mt-2"
    >
      <div className="grid grid-cols-2 gap-2">
        <input name="start" type="time" defaultValue={start} required />
        <input name="end" type="time" defaultValue={end} required />
      </div>
      {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
