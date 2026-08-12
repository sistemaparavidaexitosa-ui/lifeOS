"use client";

import { useTransition } from "react";
import { setTaskStatus } from "./actions";
import type { TaskStatus } from "@/lib/domain/types.ts";

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  Pending: ["InProgress", "Rescheduled", "Cancelled"],
  InProgress: ["Blocked", "Completed", "Rescheduled"],
  Blocked: ["InProgress", "Cancelled"],
  Rescheduled: ["Pending"],
  Completed: [],
  Cancelled: []
};

const LABELS: Record<TaskStatus, string> = {
  Pending: "Pendiente",
  InProgress: "En progreso",
  Blocked: "Bloqueada",
  Rescheduled: "Reprogramada",
  Completed: "Completada",
  Cancelled: "Cancelada"
};

export default function TaskStatusButtons({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const [pending, startTransition] = useTransition();
  const allowed = TRANSITIONS[status];

  if (!allowed.length) return <span className="text-xs" style={{ color: "var(--muted)" }}>Estado terminal</span>;

  return (
    <div className="flex gap-1 flex-wrap">
      {allowed.map((to) => (
        <button
          key={to}
          className="btn-ghost btn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await setTaskStatus(taskId, to);
              } catch (e) {
                alert(e instanceof Error ? e.message : "Error");
              }
            })
          }
        >
          → {LABELS[to]}
        </button>
      ))}
    </div>
  );
}
