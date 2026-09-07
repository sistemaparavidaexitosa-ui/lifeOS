import "server-only";

import { myTasks, myAssigneeNames, tasksAssignedTo } from "@/lib/domain/task-ownership.ts";
import type { MyTaskRow } from "@/lib/data/tasks";
import type { FactsOverrides } from "@/lib/insights/facts-loader";
import type { SourceSnapshot } from "@/lib/domain/development/goals.ts";
import type { TaskStatus } from "@/lib/domain/types.ts";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * LO QUE EL COACH NECESITA SABER DE UNA PERSONA, SIN SER ESA PERSONA.
 *
 * EL PROBLEMA QUE RESUELVE ESTE ARCHIVO, dicho sin rodeos porque es el punto
 * más delicado de todo el coach:
 *
 * El mensaje diario lo dispara un reloj (`/api/push/dispatch`, pg_cron cada
 * cinco minutos desde 0051). Ahí no hay sesión, así que se usa el cliente de
 * servicio — y el cliente de servicio **salta la RLS**. Todo lo que el resto
 * del sistema da por hecho («no hace falta filtrar, las políticas ya lo hacen»)
 * deja de ser cierto en este camino. Una consulta sin `user_id` aquí no
 * devolvería cero filas: devolvería las de todo el mundo, y el coach le
 * contaría a alguien la agenda de otro.
 *
 * Por eso este archivo tiene UNA sola regla, y no admite excepciones:
 *
 *   TODA consulta filtra explícitamente por el usuario. Las que cuelgan de una
 *   tabla padre lo hacen por la lista de ids del padre, ya filtrada.
 *
 * Y por eso el coach NO recibe la herramienta `consultar`, que arma consultas
 * a partir de lo que el modelo pida: bajo el cliente de servicio no habría
 * forma de garantizar esta regla. El coach razona sobre hechos ya calculados;
 * el chat —que sí corre con la llave de sesión y la RLS puesta— conserva el
 * acceso completo a las filas.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Perfil personal vacío: `keyResultProgress` lo lee como «fuente no resuelta» y marca `stale`. */
const SIN_FUENTES: SourceSnapshot = {
  habitCompletionPct: {},
  projectDonePct: {},
  bookPagesRead: {},
  financialGoalAmount: {},
  savingsGoalAmount: {},
  nutritionAdherencePct: {},
  bodyWeightKg: {}
};

/**
 * Las tareas del usuario, con la MISMA definición de «mía» que el resto de la
 * app (`myTasks`, domain/task-ownership.ts). No se reimplementa el criterio:
 * lo único que cambia respecto a `loadMyTasks` es de dónde salen las filas, que
 * aquí se acotan a mano en vez de dejárselo a la RLS.
 */
async function tareasDe(supabase: Admin, userId: string): Promise<MyTaskRow[]> {
  const [{ data: propios }, { data: asignadas }, { data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("projects").select("id").eq("owner_id", userId),
    // `task_assignees.user_id` existe desde 0050. Se usa el id y no el nombre
    // porque aquí no hay a quién preguntarle cómo se llama.
    supabase.from("task_assignees").select("task_id, user_name").eq("user_id", userId),
    supabase.from("profiles").select("name").eq("user_id", userId).maybeSingle(),
    supabase.from("memberships").select("user_name").eq("user_id", userId)
  ]);

  const projectIds = (propios ?? []).map((p) => p.id);
  const taskIds = (asignadas ?? []).map((a) => a.task_id);
  if (!projectIds.length && !taskIds.length) return [];

  // Una sola consulta para las dos vías: sus proyectos y lo que le asignaron.
  // `or` con dos `in` es lo que evita traer la tabla entera y filtrar en
  // memoria, que bajo el cliente de servicio sería traerse la de todos.
  const filtros: string[] = [];
  if (projectIds.length) filtros.push(`project_id.in.(${projectIds.join(",")})`);
  if (taskIds.length) filtros.push(`id.in.(${taskIds.join(",")})`);

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, due, est, impact, project_id, deps, completed_at")
    .or(filtros.join(","));

  const names = myAssigneeNames(
    (memberships ?? []).map((m) => m.user_name),
    profile?.name
  );

  const mias = myTasks(
    (tasks ?? []).map((t) => ({ ...t, projectId: t.project_id })),
    {
      myProjectIds: new Set(projectIds),
      assignedToMe: tasksAssignedTo(
        (asignadas ?? []).map((a) => ({ task_id: a.task_id, user_name: a.user_name })),
        names
      )
    }
  );

  return mias.map((t) => ({
    id: t.id,
    title: t.title,
    projectId: t.project_id,
    status: t.status as TaskStatus,
    due: t.due,
    est: t.est,
    impact: t.impact,
    deps: t.deps ?? [],
    completedAtISO: t.completed_at ? t.completed_at.slice(0, 10) : null
  }));
}

/**
 * Las fuentes que alimentan el avance de los resultados clave.
 *
 * Solo se resuelven las tres que se pueden acotar por `user_id` en una consulta
 * directa; las que dependen de agregados por proyecto o de nutrición se quedan
 * fuera y `keyResultProgress` las marca `stale`, que es exactamente la rama que
 * ya existía para una fuente borrada. Un porcentaje a medias sería peor que
 * ninguno: `growthFacts` está preparado para no afirmar el avance cuando no lo
 * sabe (`pct: null`), y esto es lo que hace que esa rama importe.
 */
async function fuentesDe(supabase: Admin, userId: string): Promise<SourceSnapshot> {
  const [{ data: books }, { data: fgoals }, { data: sgoals }] = await Promise.all([
    supabase.from("books").select("id, current_page").eq("user_id", userId),
    supabase.from("financial_goals").select("id, current_amount").eq("user_id", userId),
    supabase.from("savings_goals").select("id, current_amount").eq("user_id", userId)
  ]);

  const snapshot: SourceSnapshot = { ...SIN_FUENTES, bookPagesRead: {}, financialGoalAmount: {}, savingsGoalAmount: {} };
  for (const b of books ?? []) snapshot.bookPagesRead[b.id] = b.current_page;
  for (const g of fgoals ?? []) snapshot.financialGoalAmount[g.id] = Number(g.current_amount);
  for (const g of sgoals ?? []) snapshot.savingsGoalAmount[g.id] = Number(g.current_amount);
  return snapshot;
}

/**
 * Las tres piezas que `loadFacts` no puede resolver sin sesión, resueltas aquí
 * con filtros explícitos. `personalWorkspaceIds` va vacío a propósito: el
 * dominio `activity` queda fuera del mensaje diario —la semana del equipo no es
 * material de coach, y resolverla sin sesión abriría justo el tipo de consulta
 * que este archivo existe para no hacer.
 */
export async function overridesDelCoach(supabase: Admin, userId: string): Promise<FactsOverrides> {
  const [myTasksRows, sources] = await Promise.all([tareasDe(supabase, userId), fuentesDe(supabase, userId)]);
  return { myTasks: myTasksRows, sources, personalWorkspaceIds: [] };
}
