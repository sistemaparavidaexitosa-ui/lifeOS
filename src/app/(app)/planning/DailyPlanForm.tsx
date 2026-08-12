"use client";

import { useMemo, useState, useTransition } from "react";
import { approveDailyPlan } from "./actions";

interface TaskLite {
  id: string;
  title: string;
  project_id: string;
  est: number;
}
interface ProjectLite {
  id: string;
  title: string;
}

/**
 * FR-PLN-008: flujo jerárquico proyecto->tarea. Primero se elige el
 * proyecto (o "Todos"); el selector de la Única Cosa y las tareas de
 * impacto se filtran a solo las tareas de ese proyecto.
 */
export default function DailyPlanForm({ projects, tasks }: { projects: ProjectLite[]; tasks: TaskLite[] }) {
  const [projectId, setProjectId] = useState<string>("");
  const [oneThingId, setOneThingId] = useState<string>("");
  const [impactIds, setImpactIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => (projectId ? tasks.filter((t) => t.project_id === projectId) : tasks), [projectId, tasks]);

  function toggleImpact(id: string) {
    setImpactIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await approveDailyPlan(fd);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
          }
        })
      }
      className="flex flex-col gap-3"
    >
      <div className="text-xs p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface))", borderLeft: "3px solid var(--accent)" }}>
        Primero selecciona el proyecto, luego la tarea que será tu Única Cosa (FR-PLN-008).
      </div>

      <div className="field">
        <label className="block text-xs font-bold mb-1">1. Proyecto</label>
        <select
          name="projectId"
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setOneThingId("");
            setImpactIds([]);
          }}
        >
          <option value="">Todos los proyectos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="block text-xs font-bold mb-1">2. Tarea que será tu Única Cosa</label>
        <select name="oneThingTaskId" value={oneThingId} onChange={(e) => setOneThingId(e.target.value)} required>
          <option value="" disabled>
            — selecciona una tarea —
          </option>
          {candidates.length === 0 && <option disabled>— sin tareas en este proyecto —</option>}
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="block text-xs font-bold mb-1">Tareas de impacto adicionales (máx. 3)</label>
        <div className="flex flex-col gap-1">
          {candidates.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="impactTaskIds"
                value={t.id}
                checked={impactIds.includes(t.id)}
                onChange={() => toggleImpact(t.id)}
                style={{ width: "auto", minHeight: "auto" }}
              />
              {t.title} · {t.est} min
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-xs p-2 rounded-lg" style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <button type="submit" className="btn-primary" disabled={pending || !oneThingId}>
        {pending ? "Guardando…" : "Aprobar plan"}
      </button>
    </form>
  );
}
