import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { myTasks, myAssigneeNames, tasksAssignedTo } from "@/lib/domain/task-ownership.ts";
import type { TaskStatus } from "@/lib/domain/types.ts";

/**
 * Las tareas que son MÍAS, con la única definición que debe existir.
 *
 * Vive aquí y no dentro de Home porque el motor de recomendaciones necesita
 * exactamente lo mismo: si Intelligence OS tuviera su propio criterio de qué
 * tarea me pertenece, acabaría diciéndome que voy saturado por el trabajo de un
 * compañero, o callándose el que sí me toca. Una definición, dos lectores.
 *
 * La REGLA (unión de proyectos propios y tareas asignadas) está en
 * domain/task-ownership.ts y se prueba sin base de datos. Aquí solo se cargan
 * las filas y se le pasan.
 *
 * `cache()` de React deduplica por request, igual que getSessionUser.
 */
export interface MyTaskRow {
  id: string;
  title: string;
  projectId: string;
  status: TaskStatus;
  due: string | null;
  est: number;
  impact: boolean;
  deps: string[];
  /** `completed_at` recortado a fecha ISO. Null mientras siga abierta. */
  completedAtISO: string | null;
}

export const loadMyTasks = cache(async (userId: string): Promise<MyTaskRow[]> => {
  const supabase = await createClient();

  const [{ data: tasks }, { data: projects }, { data: assignees }, { data: memberships }, { data: profile }] =
    await Promise.all([
      // Sin filtro: RLS ya decide qué tareas puede ver este usuario.
      supabase.from("tasks").select("id, title, status, due, est, impact, project_id, deps, completed_at"),
      supabase.from("projects").select("id, owner_id"),
      supabase.from("task_assignees").select("task_id, user_name"),
      // Solo devuelve las filas propias del usuario (política SELECT de 0012).
      supabase.from("memberships").select("user_name"),
      supabase.from("profiles").select("name").eq("user_id", userId).single()
    ]);

  const names = myAssigneeNames(
    (memberships ?? []).map((m) => m.user_name),
    profile?.name
  );

  const mine = myTasks(
    (tasks ?? []).map((t) => ({ ...t, projectId: t.project_id })),
    {
      myProjectIds: new Set((projects ?? []).filter((p) => p.owner_id === userId).map((p) => p.id)),
      assignedToMe: tasksAssignedTo(assignees ?? [], names)
    }
  );

  return mine.map((t) => ({
    id: t.id,
    title: t.title,
    projectId: t.project_id,
    status: t.status as TaskStatus,
    due: t.due,
    est: t.est,
    impact: t.impact,
    deps: t.deps ?? [],
    // `completed_at` es timestamptz; los hechos comparan fechas ISO.
    completedAtISO: t.completed_at ? t.completed_at.slice(0, 10) : null
  }));
});
