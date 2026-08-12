"use client";

import { useState, useTransition } from "react";
import { approveWeeklyReview } from "./actions";

export default function WeeklyReviewPanel({ blockedCount }: { blockedCount: number }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {blockedCount > 0 ? (
        <div className="text-xs p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--warn) 10%, var(--surface))", borderLeft: "3px solid var(--warn)" }}>
          Tienes {blockedCount} tarea(s) bloqueada(s).
        </div>
      ) : (
        <div className="text-xs p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface))", borderLeft: "3px solid var(--accent)" }}>
          Sin bloqueos. Puedes aprobar la revisión.
        </div>
      )}
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Al aprobar se genera un snapshot inmutable de la semana (BR-004).
      </p>
      <button
        className="btn-primary"
        disabled={pending || done}
        onClick={() =>
          startTransition(async () => {
            await approveWeeklyReview();
            setDone(true);
          })
        }
      >
        {done ? "Revisión aprobada ✓" : "Aprobar revisión"}
      </button>
    </div>
  );
}
