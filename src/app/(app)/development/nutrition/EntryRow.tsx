"use client";

import { useTransition } from "react";
import { deleteFoodEntry } from "./actions";

/**
 * Una línea del diario. El botón de borrar es lo que sustituye al `unique` que
 * el resto de los diarios del repo sí tienen: aquí dos manzanas son dos
 * manzanas, así que la protección contra el registro duplicado es verlo y
 * quitarlo, no que la base lo impida.
 */
export default function EntryRow({
  id,
  name,
  brand,
  grams,
  kcal
}: {
  id: string;
  name: string;
  brand: string;
  grams: number;
  kcal: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 text-sm" style={{ opacity: pending ? 0.5 : 1 }}>
      <span className="grow">
        {name}
        {brand ? <span style={{ color: "var(--muted)" }}> · {brand}</span> : null}
        <span style={{ color: "var(--muted)" }}> · {grams} g</span>
      </span>
      <span style={{ color: "var(--muted)" }}>{kcal} kcal</span>
      <button
        type="button"
        className="btn-ghost btn-sm"
        aria-label={`Quitar ${name}`}
        disabled={pending}
        onClick={() => startTransition(async () => void (await deleteFoodEntry(id)))}
      >
        ×
      </button>
    </div>
  );
}
