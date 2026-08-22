import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fdate } from "@/lib/format";
import { isOverdue, isOpen, type BoardTaskLike } from "@/lib/domain/board.ts";
import { todayInTimeZone } from "@/lib/domain/datetime.ts";
import { getUserTimeZone } from "@/lib/data/profile";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";
import NewProjectForm from "./NewProjectForm";
import ProjectSidebar, { type SidebarProject } from "./ProjectSidebar";
import ProjectsOverview from "./ProjectsOverview";
import BoardHeader from "./BoardHeader";
import BoardShell from "./BoardShell";
import { isExecutionView, type BoardGroup, type BoardTask, type ExecutionView } from "./board-types";
import { getProjectLogAndKnowledge } from "./logbook-knowledge-actions";

// REDISEÑO DEL FLUJO DE PROYECTOS (estilo monday.com / ClickUp)
//
// Antes: lista-acordeón de proyectos; abrir uno lo expandía in situ y cada
// vista (?view=) era una navegación completa que volvía a consultar la base
// y reiniciaba filtros/scroll. Cada vista además pedía SUS propios datos
// (responsables solo en Kanban, miembros solo en Tablero, grupos solo en
// Tablero/Árbol), así que cambiar de vista podía mostrar información
// distinta del mismo proyecto.
//
// Ahora:
//   1. Layout de 2 paneles: navegador de tableros fijo a la izquierda
//      (ProjectSidebar) + área de trabajo a la derecha. Sin proyecto
//      seleccionado se muestra el portafolio (ProjectsOverview).
//   2. Este Server Component consulta UNA sola vez TODO lo que el tablero
//      necesita (tareas, grupos, responsables, comentarios, miembros) y se
//      lo entrega a BoardShell, que mantiene el estado en el cliente. Las 4
//      vistas (Tablero, Kanban, Tabla, Timeline) son funciones de ese mismo
//      estado: cambiar de vista ya no recarga ni pierde contexto.
//   3. `view` sigue viviendo en la URL para que el enlace sea compartible;
//      BoardShell la sincroniza con history.replaceState.
export default async function ExecutionPage({
  searchParams
}: {
  searchParams: Promise<{ project?: string; view?: string }>;
}) {
  const { project: selectedProjectId, view: rawView } = await searchParams;
  const view: ExecutionView = isExecutionView(rawView) ? rawView : "board";
  // "Hoy" sale de profiles.timezone, no del reloj del servidor (UTC en
  // Vercel): de lo contrario el conteo de vencidas se corría un día cada
  // tarde. El mismo valor viaja al cliente para que tablero y barra lateral
  // nunca se contradigan. Ver src/lib/domain/datetime.ts.
  const today = todayInTimeZone(await getUserTimeZone());

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
  const { data: allTasks } = await supabase.from("tasks").select("id, project_id, status, due, parent_task_id");

  const sidebarProjects: SidebarProject[] = (projects ?? []).map((p) => {
    const rootTasks = (allTasks ?? []).filter((t) => t.project_id === p.id && !t.parent_task_id);
    const countable = rootTasks.filter((t) => t.status !== "Cancelled");
    const done = countable.filter((t) => t.status === "Completed").length;
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      priority: p.priority,
      progress: countable.length ? Math.round((done / countable.length) * 100) : 0,
      taskCount: rootTasks.length,
      openCount: rootTasks.filter((t) => isOpen(t.status as TaskStatus)).length,
      overdueCount: rootTasks.filter((t) => isOverdue({ due: t.due, status: t.status as TaskStatus }, today)).length,
      targetDate: p.target_date,
      targetDateLabel: p.target_date ? fdate(p.target_date) : ""
    };
  });

  const selectedProject = selectedProjectId ? projects?.find((p) => p.id === selectedProjectId) : undefined;

  return (
    <div className="ex-workspace">
      <ProjectSidebar projects={sidebarProjects} selectedId={selectedProject?.id ?? null} view={view}>
        <NewProjectForm />
      </ProjectSidebar>

      <main className="ex-main">
        {!selectedProject ? (
          <ProjectsOverview projects={sidebarProjects} view={view} />
        ) : (
          <BoardWorkspace projectRow={selectedProject} view={view} userId={user.id} today={today} />
        )}
      </main>
    </div>
  );
}

/**
 * Carga y arma el tablero de UN proyecto. Se separa de la página para que
 * Next pueda hacer streaming del panel izquierdo mientras se resuelven estas
 * consultas.
 */
async function BoardWorkspace({
  projectRow,
  view,
  userId,
  today
}: {
  projectRow: { id: string; title: string; objective: string | null; status: string; priority: string; target_date: string | null; workspace_id: string | null };
  view: ExecutionView;
  userId: string;
  today: string;
}) {
  const supabase = await createClient();
  const projectId = projectRow.id;

  const TASK_COLUMNS = "id, title, status, priority, due, start_date, est, urgent, parent_task_id, group_id, position";
  let orderingEnabled = true;
  let taskRows: Record<string, unknown>[] = [];

  const { data, error } = await supabase.from("tasks").select(TASK_COLUMNS).eq("project_id", projectId).order("position");
  if (error) {
    // Degradación explícita: si la migración 0021 (tasks.position) todavía no
    // está aplicada, el tablero sigue funcionando con el orden histórico por
    // created_at y BoardShell desactiva el arrastre en vez de romperse.
    orderingEnabled = false;
    const { data: legacy } = await supabase
      .from("tasks")
      .select("id, title, status, priority, due, start_date, est, urgent, parent_task_id, group_id")
      .eq("project_id", projectId)
      .order("created_at");
    taskRows = (legacy ?? []) as Record<string, unknown>[];
  } else {
    taskRows = (data ?? []) as Record<string, unknown>[];
  }

  const tasks: BoardTask[] = taskRows.map((t, index) => ({
    id: t.id as string,
    title: t.title as string,
    status: t.status as TaskStatus,
    priority: t.priority as Priority,
    due: (t.due as string | null) ?? null,
    startDate: (t.start_date as string | null) ?? null,
    est: (t.est as number) ?? 0,
    urgent: Boolean(t.urgent),
    parentTaskId: (t.parent_task_id as string | null) ?? null,
    groupId: (t.group_id as string | null) ?? null,
    position: (t.position as number | undefined) ?? index
  }));

  const taskIds = tasks.map((t) => t.id);
  const [{ data: groupRows }, { data: assigneeRows }, { data: commentRows }, logAndKnowledge] = await Promise.all([
    supabase.from("task_groups").select("id, name, color, position").eq("project_id", projectId).order("position"),
    taskIds.length
      ? supabase.from("task_assignees").select("task_id, user_name").in("task_id", taskIds)
      : Promise.resolve({ data: [] as { task_id: string; user_name: string }[] }),
    taskIds.length
      ? supabase.from("comments").select("subject_id").eq("subject_type", "task").in("subject_id", taskIds)
      : Promise.resolve({ data: [] as { subject_id: string }[] }),
    getProjectLogAndKnowledge(projectId)
  ]);

  const assigneesByTask = (assigneeRows ?? []).reduce<Record<string, string[]>>((acc, row) => {
    (acc[row.task_id] ??= []).push(row.user_name);
    return acc;
  }, {});
  const commentCountByTask = (commentRows ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.subject_id] = (acc[row.subject_id] ?? 0) + 1;
    return acc;
  }, {});

  let members: string[] = [];
  if (projectRow.workspace_id) {
    const { data: rows } = await supabase.rpc("list_workspace_members", { p_workspace_id: projectRow.workspace_id });
    members = (rows ?? []).map((m: { user_name: string }) => m.user_name);
  } else {
    const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", userId).single();
    if (profile?.name) members = [profile.name];
  }

  const rootTasks: BoardTaskLike[] = tasks.filter((t) => !t.parentTaskId);
  const countable = rootTasks.filter((t) => t.status !== "Cancelled");
  const done = countable.filter((t) => t.status === "Completed").length;

  return (
    <>
      <BoardHeader
        project={{
          id: projectRow.id,
          title: projectRow.title,
          objective: projectRow.objective ?? "",
          status: projectRow.status,
          priority: projectRow.priority,
          targetDate: projectRow.target_date
        }}
        progress={countable.length ? Math.round((done / countable.length) * 100) : 0}
        taskCount={rootTasks.length}
        openCount={rootTasks.filter((t) => isOpen(t.status)).length}
        overdueCount={tasks.filter((t) => isOverdue(t, today)).length}
        targetDateLabel={projectRow.target_date ? fdate(projectRow.target_date) : ""}
        sequenceTasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
        logbookEntries={logAndKnowledge.logbook}
        knowledgeItems={logAndKnowledge.knowledge}
      />

      <BoardShell
        key={projectId}
        projectId={projectId}
        initialTasks={tasks}
        initialGroups={(groupRows ?? []) as BoardGroup[]}
        initialAssignees={assigneesByTask}
        commentCountByTask={commentCountByTask}
        members={members}
        initialView={view}
        orderingEnabled={orderingEnabled}
        today={today}
      />
    </>
  );
}
