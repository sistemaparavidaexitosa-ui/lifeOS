"use client";
// Los recordatorios que tocan hoy.
//
// Aparecen en Home y no en una pantalla propia porque no son un módulo: son lo
// que pediste que se te recordara, y Home es la pantalla del día. Un
// recordatorio que hay que ir a buscar no es un recordatorio.

import { useTransition } from "react";
import Link from "next/link";
import { completeReminder } from "@/app/(app)/execution/thread-actions";
import { overdueDays, type ReminderLike } from "@/lib/domain/execution/reminders.ts";

export interface ReminderCard extends ReminderLike {
  /** Título de la tarea a la que apunta, si sigue existiendo. */
  subjectTitle: string | null;
}

export default function RemindersCard({ reminders, todayISO }: { reminders: ReminderCard[]; todayISO: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <>
      {reminders.map((r) => {
        const atraso = overdueDays(r, todayISO);
        return (
          <div
            key={r.id}
            className="list-item flex items-center gap-3 py-2.5"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <div className="grow min-w-0">
              <b className="block truncate">{r.subjectTitle ?? (r.text || "Recordatorio")}</b>
              <div className="text-xs" style={{ color: atraso > 0 ? "var(--danger)" : "var(--muted)" }}>
                {atraso === 0 ? "Para hoy" : atraso === 1 ? "Desde ayer" : `Esperando ${atraso} días`}
              </div>
            </div>
            {r.subjectType === "task" && r.subjectTitle && (
              <Link href={`/execution?task=${r.subjectId}`} className="btn-ghost btn-sm">
                Abrir
              </Link>
            )}
            <button
              className="btn-ghost btn-sm"
              disabled={pending}
              onClick={() => startTransition(() => completeReminder(r.id))}
              aria-label="Dar por hecho el recordatorio"
            >
              Listo
            </button>
          </div>
        );
      })}
    </>
  );
}
