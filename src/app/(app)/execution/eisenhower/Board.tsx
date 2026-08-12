"use client";

import { useState, useTransition } from "react";
import { changeTaskQuadrant } from "./actions";
import { quadrantOf } from "@/lib/domain/eisenhower.ts";
import type { EisenhowerQuadrant, Priority } from "@/lib/domain/types.ts";

interface TaskLite {
  id: string;
  title: string;
  urgent: boolean;
  priority: Priority;
}

const QUADS: { id: EisenhowerQuadrant; label: string; sub: string; borderColor: string }[] = [
  { id: "do", label: "Hacer ahora", sub: "Urgente + Importante", borderColor: "var(--danger)" },
  { id: "plan", label: "Planificar", sub: "No urgente + Importante", borderColor: "var(--accent)" },
  { id: "delegate", label: "Delegar", sub: "Urgente + No importante", borderColor: "var(--info)" },
  { id: "drop", label: "Eliminar / Posponer", sub: "No urgente + No importante", borderColor: "var(--muted)" }
];

export default function EisenhowerBoard({ tasks }: { tasks: TaskLite[] }) {
  const [items, setItems] = useState(tasks);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDrop(quadrant: EisenhowerQuadrant, taskId: string) {
    startTransition(async () => {
      try {
        await changeTaskQuadrant(taskId, quadrant);
        // Optimistic local update para feedback inmediato (<150ms percibido).
        setItems((prev) => {
          const map: Record<EisenhowerQuadrant, { urgent: boolean; priority: Priority }> = {
            do: { urgent: true, priority: "High" },
            plan: { urgent: false, priority: "High" },
            delegate: { urgent: true, priority: "Medium" },
            drop: { urgent: false, priority: "Low" }
          };
          return prev.map((t) => (t.id === taskId ? { ...t, ...map[quadrant] } : t));
        });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <div>
      {error && (
        <div className="text-xs p-2 rounded-lg mb-2" style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
          {error}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        {QUADS.map((q) => {
          const inQuad = items.filter((t) => quadrantOf(t) === q.id);
          return (
            <div
              key={q.id}
              className="rounded-2xl p-3 min-h-[160px]"
              style={{ background: "var(--surface2)", borderTop: `3px solid ${q.borderColor}` }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("id");
                if (id) onDrop(q.id, id);
              }}
            >
              <div className="flex items-center justify-between">
                <b>{q.label}</b>
                <span className="chip">{inQuad.length}</span>
              </div>
              <div className="text-xs mb-1.5" style={{ color: "var(--muted)" }}>
                {q.sub}
              </div>
              {!inQuad.length && (
                <div className="text-xs py-2.5" style={{ color: "var(--muted)" }}>
                  Sin tareas aquí.
                </div>
              )}
              {inQuad.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("id", t.id)}
                  className="flex items-center gap-2 rounded-full px-3.5 py-2 my-1.5 cursor-grab"
                  style={{ background: "var(--surface)", border: "1px solid var(--line)", opacity: pending ? 0.7 : 1 }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                  <span className="text-sm truncate" style={{ maxWidth: 200 }}>
                    {t.title}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
