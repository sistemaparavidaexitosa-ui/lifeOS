import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fdate } from "@/lib/format";
import { isOverdue, isOpen, type BoardTaskLike } from "@/lib/domain/board.ts";
import { todayInTimeZone } from "@/lib/domain/datetime.ts";
import { getUserTimeZone } from "@/lib/data/profile";
import { listWorkspaces, ROLES_QUE_CREAN, type WorkspaceSummary } from "@/lib/data/workspaces";
import type { TaskStatus, Priority, ProjectStatus } from "@/lib/domain/types.ts";
import NewProjectForm from "./NewProjectForm";
import PortfolioBoard, { type PortfolioProject } from "./PortfolioBoard";
import WorkspaceSwitcher from "@/components/workspace/WorkspaceSwitcher";
import WorkspaceTabs from "@/components/workspace/WorkspaceTabs";
import TeamSection from "@/components/workspace/TeamSection";
import BoardHeader from "./BoardHeader";
import BoardShell from "./BoardShell";
import { isExecutionView, type BoardGroup, type BoardTask, type ExecutionView } from "./board-types";
import { getProjectLogAndKnowledge } from "./logbook-knowledge-actions";
import { getSessionUser } from "@/lib/data/session";
import InsightSection from "@/components/InsightSection";

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
//   1. Una sola pantalla por vez. Sin ?project= se ve la CARTERA: todos los
//      proyectos como filas tipo monday (PortfolioBoard). Con ?project= se ve
//      ese tablero a ancho completo, con una miga de pan para volver.
//
//      Antes había dos paneles y la lista de proyectos se pintaba DOS VECES a
//      la vez —el navegador lateral y el portafolio en tarjetas—, con los
//      mismos datos en dos formatos. El navegador lateral se elimina: la fila
//      de la cartera es a la vez la lista y el enlace al tablero.
//   2. Este Server Component consulta UNA sola vez TODO lo que el tablero
//      necesita (tareas, grupos, responsables, comentarios, miembros) y se
//      lo entrega a BoardShell, que mantiene el estado en el cliente. Las 4
//      vistas (Tablero, Kanban, Tabla, Timeline) son funciones de ese mismo
//      estado: cambiar de vista ya no recarga ni pierde contexto.
//   3. `view` sigue viviendo en la URL para que el enlace sea compartible;
//      BoardShell la sincroniza con history.replaceState.
//   4. Todo proyecto vive en un ESPACIO DE TRABAJO (migración 0030), y ser
//      miembro del espacio ya da acceso a sus proyectos (0031). Por eso el
//      selector de espacio y el panel de Equipo están aquí y no en una sección
//      aparte del menú lateral: elegir espacio ES elegir qué proyectos se ven.
//      El espacio activo viaja en ?ws= para que el enlace sea compartible.
export default async function ExecutionPage({
  searchParams
}: {
  searchParams: Promise<{ project?: string; view?: string; ws?: string }>;
}) {
  const { project: selectedProjectId, view: rawView, ws: requestedWorkspaceId } = await searchParams;
  const view: ExecutionView = isExecutionView(rawView) ? rawView : "board";

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Las cuatro lecturas van en PARALELO: ninguna depende del resultado de otra
  // y encadenarlas costaba cuatro viajes de ida y vuelta en serie antes del
  // primer byte de HTML — que en un móvil es justo el rato en el que la
  // pantalla se queda igual y parece que el toque no registró.
  //
  // "Hoy" sale de profiles.timezone y no del reloj del servidor (UTC en
  // Vercel): de lo contrario el conteo de vencidas se corría un día cada
  // tarde. El mismo valor viaja al cliente para que tablero y barra lateral
  // nunca se contradigan. Ver src/lib/domain/datetime.ts.
  //
  // `projects` sigue trayendo TODO lo visible (la RLS ya filtra por membresía):
  // hace falta completo para localizar el proyecto abierto por ?project=, que
  // puede vivir en un espacio distinto del activo. La cartera sí se filtra.
  const [timeZone, workspaces, { data: projects }, { data: allTasks }] = await Promise.all([
    getUserTimeZone(),
    listWorkspaces(),
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.from("tasks").select("id, project_id, status, due, parent_task_id")
  ]);
  const today = todayInTimeZone(timeZone);

  const selectedProject = selectedProjectId ? projects?.find((p) => p.id === selectedProjectId) : undefined;

  // Espacio activo: el de ?ws= si el usuario todavía lo alcanza; si no, el del
  // proyecto abierto; si no, el personal. Nunca "ninguno": desde 0030 no
  // existe un proyecto sin espacio, así que tampoco una cartera sin espacio.
  const activeWorkspace: WorkspaceSummary | undefined =
    workspaces.find((w) => w.id === requestedWorkspaceId) ??
    workspaces.find((w) => w.id === selectedProject?.workspace_id) ??
    workspaces.find((w) => w.isPersonal) ??
    workspaces[0];

  const portfolio: PortfolioProject[] = (projects ?? []).filter((p) => p.workspace_id === activeWorkspace?.id).map((p) => {
    const rootTasks = (allTasks ?? []).filter((t) => t.project_id === p.id && !t.parent_task_id);
    const countable = rootTasks.filter((t) => t.status !== "Cancelled");
    const done = countable.filter((t) => t.status === "Completed").length;
    return {
      id: p.id,
      title: p.title,
      status: p.status as ProjectStatus,
      priority: p.priority as Priority,
      progress: countable.length ? Math.round((done / countable.length) * 100) : 0,
      taskCount: rootTasks.length,
      openCount: rootTasks.filter((t) => isOpen(t.status as TaskStatus)).length,
      overdueCount: rootTasks.filter((t) => isOverdue({ due: t.due, status: t.status as TaskStatus }, today)).length,
      targetDate: p.target_date,
      targetDateLabel: p.target_date ? fdate(p.target_date) : ""
    };
  });

  const canCreate = activeWorkspace ? ROLES_QUE_CREAN.includes(activeWorkspace.role) : false;
  const backHref = selectedProject?.workspace_id ? `/execution?ws=${selectedProject.workspace_id}` : "/execution";

  return (
    <main className="ex-main">
      {!selectedProject ? (
        <>
        <PortfolioBoard
          projects={portfolio}
          view={view}
          workspaceName={activeWorkspace?.name ?? ""}
          workspaceNav={
            activeWorkspace && (
              <>
                <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspace.id} basePath="/execution" />
                <WorkspaceTabs workspaceId={activeWorkspace.id} />
                {/* Suspense de verdad, no de comentario: sin este límite las
                    dos consultas de TeamSection (roster + invitaciones)
                    bloqueaban el render de la CARTERA entera. La cabecera del
                    equipo, que casi nadie mira, retrasaba la lista de
                    proyectos que mira todo el mundo. */}
                {!activeWorkspace.isPersonal && (
                  <Suspense fallback={<span className="btn-ghost btn-sm" aria-hidden>Equipo…</span>}>
                    <TeamSection workspace={activeWorkspace} userId={user.id} projectCount={portfolio.length} />
                  </Suspense>
                )}
              </>
            )
          }
        >
          {canCreate && activeWorkspace && (
            <NewProjectForm workspaceId={activeWorkspace.id} workspaceName={activeWorkspace.name} />
          )}
        </PortfolioBoard>

        {/* El análisis mira la CARTERA —lo vencido, lo estancado, lo que ya se
            puede empezar—, así que vive aquí y no dentro del tablero de un
            proyecto. Y va tras un límite de Suspense por el mismo motivo que
            TeamSection: su consulta no puede retrasar la lista de proyectos. */}
        <Suspense fallback={null}>
          <InsightSection scope="execution" />
        </Suspense>
        </>
      ) : (
        <>
          {/* Sin navegador lateral, esta miga de pan es el único camino de
              vuelta: no puede faltar ni esconderse tras un menú. Vuelve al
              espacio DEL PROYECTO, no al que estuviera activo: si no, abrir un
              proyecto de otro espacio y volver dejaba al usuario en una
              cartera donde ese proyecto no aparece. */}
          <nav className="ex-crumbs" aria-label="Ruta">
            <Link href={backHref} className="ex-crumb-back">
              ← Proyectos
            </Link>
            <span className="ex-crumb-sep">/</span>
            <span className="ex-crumb-current">{selectedProject.title}</span>
          </nav>
          <BoardWorkspace projectRow={selectedProject} view={view} userId={user.id} today={today} />
        </>
      )}
    </main>
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
  projectRow: { id: string; title: string; objective: string | null; status: string; priority: string; target_date: string | null; workspace_id: string };
  view: ExecutionView;
  userId: string;
  today: string;
}) {
  const supabase = await createClient();
  const projectId = projectRow.id;

  // Destinos válidos para "Mover a otro espacio": solo donde el usuario puede
  // crear/escribir. Ofrecer un espacio donde es Viewer sería enseñarle un
  // botón que la RLS va a rechazar (projects_update_edit, 0031).
  const allWorkspaces = await listWorkspaces();
  const moveTargets = allWorkspaces.filter((w) => ROLES_QUE_CREAN.includes(w.role));
  const projectWorkspace = allWorkspaces.find((w) => w.id === projectRow.workspace_id);

  // Nivel de project_shares vigente: desde 0031 esa fila ya no decide el
  // acceso del equipo, solo el del rol Guest.
  const { data: share } = await supabase
    .from("project_shares")
    .select("access_level")
    .eq("project_id", projectId)
    .maybeSingle();

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

  // Responsables asignables. Ya no hay rama "proyecto sin workspace": desde
  // 0030 todo proyecto vive en uno, y en el personal el RPC devuelve al propio
  // usuario como único miembro, que es exactamente lo que aquella rama
  // fabricaba a mano consultando `profiles`.
  const { data: memberRows } = await supabase.rpc("list_workspace_members", { p_workspace_id: projectRow.workspace_id });
  let members: string[] = ((memberRows ?? []) as { user_name: string }[]).map((m) => m.user_name);
  if (!members.length) {
    // Red de seguridad para una cuenta anterior a 0030 cuya membresía Owner no
    // llegó a crearse: sin esto el selector de responsables saldría vacío.
    const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", userId).single();
    if (profile?.name) members = [profile.name];
  }

  const rootTasks: BoardTaskLike[] = tasks.filter((t) => !t.parentTaskId);
  const countable = rootTasks.filter((t) => t.status !== "Cancelled");
  const done = countable.filter((t) => t.status === "Completed").length;

  return (
    <>
      <BoardHeader
        workspaces={moveTargets}
        currentWorkspaceId={projectRow.workspace_id}
        guestAccess={share?.access_level ?? null}
        workspaceIsPersonal={projectWorkspace?.isPersonal ?? false}
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
