import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, Progress, EmptyState } from "@/components/ui";
import { fdate } from "@/lib/format";
import NewTaskForm from "./NewTaskForm";
import SequenceButton from "./SequenceButton";
import TaskDetailPanel from "./TaskDetailPanel";
import KanbanBoard, { type KanbanTask } from "./KanbanBoard";
import MondayBoard, { type MondayTask, type MondayGroup } from "./MondayBoard";
import TreeView, { type TreeGroup } from "./TreeView";
import type { TreeNodeTask } from "./TreeItemNode";
import ViewToggle, { type ExecutionView } from "./ViewToggle";
import LogbookCard from "./LogbookCard";
import KnowledgeCard from "./KnowledgeCard";
import ProjectsPanel, { type PanelProject } from "./ProjectsPanel";
import { getProjectLogAndKnowledge } from "./logbook-knowledge-actions";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";

// REDISEÑO Monday-style (ver /docs/CHANGES_MONDAY_UI.md):
//   1. La vista por defecto ahora es "board" (MondayBoard.tsx): grupo con
//      barra de color por proyecto, subtareas anidadas (parent_task_id,
//      migración 0018), pills de estado, avatares y columna Timeline
//      (start_date–due). Sustituye a la antigua vista "Tabla".
//   2. Se agregan 2 queries en paralelo cuando la vista es "board":
//      conteo de comentarios por tarea (para el badge 💬) y el roster de
//      miembros del proyecto (workspace o solo el titular), reutilizando
//      exactamente la misma lógica de getTaskDetail() en task-detail-actions.ts.
//   3. Bitácora, Base de conocimiento, Kanban, Lista y Secuenciación IA se
//      conservan sin cambios de comportamiento.
//   4. FASE 4: se agrega la vista "tree" (TreeView.tsx) — Group -> Item ->
//      Subitem, sobre el MISMO modelo de datos (tasks + task_groups, migración
//      0019).
//   5. FIX (retrofit de Groups en el Tablero): "groups" se carga también
//      para view === "board" (no solo "tree") y se pasa a MondayBoard como
//      initialGroups, para que renderice una sección de color POR CADA
//      Group real.
//   6. FIX (este cambio): la cuadrícula de tarjetas de proyectos se
//      reemplaza por ProjectsPanel.tsx — un panel angosto tipo sidebar a la
//      izquierda, estilo Monday.com (Workspace -> Boards). Seleccionar un
//      board ahí navega a ?project=ID y muestra sus tareas a la derecha,
//      sin cuadrícula. NewProjectForm/NewTaskForm ahora son botones "+ ..."
//      que abren/cierran el formulario (antes se quedaban siempre abiertos,
//      inconsistente con el resto de formularios del proyecto).
export default async function ExecutionPage({
  searchParams
}: {
  searchParams: Promise<{ project?: string; view?: string }>;
}) {
  const { project: selectedProjectId, view: rawView } = await searchParams;
  const view: ExecutionView =
    rawView === "kanban" ? "kanban" : rawView === "list" ? "list" : rawView === "tree" ? "tree" : "board";

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
  const { data: allTasks } = await supabase.from("tasks").select("id, project_id, status, parent_task_id");

  const progressByProject = (projectId: string) => {
    // El progreso siempre se calcula sobre TAREAS RAÍZ (sin parent_task_id):
    // una subtarea completada ya "cuenta" indirectamente al completar su
    // padre, y así no se infla artificialmente el % de un proyecto con
    // muchas subtareas pequeñas.
    const ts = (allTasks ?? []).filter((t) => t.project_id === projectId && t.status !== "Cancelled" && !t.parent_task_id);
    if (!ts.length) return 0;
    return Math.round((ts.filter((t) => t.status === "Completed").length / ts.length) * 100);
  };
  const countByProject = (projectId: string) => (allTasks ?? []).filter((t) => t.project_id === projectId && !t.parent_task_id).length;

  let selectedTasks: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: Priority;
    due: string | null;
    startDate: string | null;
    est: number;
    urgent: boolean;
    parentTaskId: string | null;
    groupId: string | null;
  }[] = [];
  let assigneesByTask: Record<string, string[]> = {};
  let commentCountByTask: Record<string, number> = {};
  let members: string[] = [];
  let groups: TreeGroup[] = [];
  let logbookEntries: Awaited<ReturnType<typeof getProjectLogAndKnowledge>>["logbook"] = [];
  let knowledgeItems: Awaited<ReturnType<typeof getProjectLogAndKnowledge>>["knowledge"] = [];

  if (selectedProjectId) {
    const selectedProject = projects?.find((p) => p.id === selectedProjectId);

    const [{ data }, logAndKnowledge] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, status, priority, due, start_date, est, urgent, parent_task_id, group_id")
        .eq("project_id", selectedProjectId)
        .order("created_at"),
      getProjectLogAndKnowledge(selectedProjectId)
    ]);
    selectedTasks = (data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status as TaskStatus,
      priority: t.priority as Priority,
      due: t.due,
      startDate: t.start_date,
      est: t.est,
      urgent: t.urgent,
      parentTaskId: t.parent_task_id,
      groupId: t.group_id
    }));
    logbookEntries = logAndKnowledge.logbook;
    knowledgeItems = logAndKnowledge.knowledge;

    // Responsables: necesarios en Kanban, Tablero (Monday-style) y la propia
    // columna "Personas". La vista de Lista no los precarga aquí — los
    // muestra el propio TaskDetailPanel al abrir.
    if ((view === "kanban" || view === "board") && selectedTasks.length) {
      const taskIds = selectedTasks.map((t) => t.id);
      const [{ data: assigneeRows }, { data: commentRows }] = await Promise.all([
        supabase.from("task_assignees").select("task_id, user_name").in("task_id", taskIds),
        view === "board"
          ? supabase.from("comments").select("subject_id").eq("subject_type", "task").in("subject_id", taskIds)
          : Promise.resolve({ data: [] as { subject_id: string }[] })
      ]);
      assigneesByTask = (assigneeRows ?? []).reduce<Record<string, string[]>>((acc, row) => {
        (acc[row.task_id] ??= []).push(row.user_name);
        return acc;
      }, {});
      commentCountByTask = (commentRows ?? []).reduce<Record<string, number>>((acc, row) => {
        acc[row.subject_id] = (acc[row.subject_id] ?? 0) + 1;
        return acc;
      }, {});
    }

    if (view === "board" && selectedProject) {
      if (selectedProject.workspace_id) {
        const { data: rows } = await supabase.rpc("list_workspace_members", { p_workspace_id: selectedProject.workspace_id });
        members = (rows ?? []).map((m: { user_name: string }) => m.user_name);
      } else {
        const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();
        if (profile?.name) members = [profile.name];
      }
    }

    // task_groups del proyecto. Gracias al backfill idempotente de la
    // migración 0019, todo proyecto ya tiene al menos el grupo "General" —
    // nunca vendrá vacío.
    if (view === "board" || view === "tree") {
      const { data: groupRows } = await supabase
        .from("task_groups")
        .select("id, name, color, position")
        .eq("project_id", selectedProjectId)
        .order("position");
      groups = groupRows ?? [];
    }
  }

  const panelProjects: PanelProject[] = (projects ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    priority: p.priority,
    progress: progressByProject(p.id),
    taskCount: countByProject(p.id)
  }));

  return (
    <div className="execution-layout">
      <ProjectsPanel projects={panelProjects} selectedProjectId={selectedProjectId ?? null} />

      <div className="execution-main">
        {!selectedProjectId && (
          <Card>
            <EmptyState icon="📋" text="Selecciona un proyecto del panel izquierdo o crea uno nuevo para empezar." />
          </Card>
        )}

        {selectedProjectId &&
          (() => {
            const proj = projects?.find((p) => p.id === selectedProjectId);
            if (!proj) return null;
            const prog = progressByProject(proj.id);
            return (
              <Card>
                <div style={{ background: "var(--surface2)", margin: "-16px", padding: 16, borderRadius: "inherit" }}>
                  <div className="flex items-center justify-between wrap" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <h3 style={{ margin: 0 }}>{proj.title}</h3>
                        <Chip kind={proj.status === "Active" ? "accent" : proj.status === "Completed" ? "ok" : ""}>{proj.status}</Chip>
                      </div>
                      <div className="text-xs" style={{ color: "var(--muted)", marginTop: 4 }}>
                        {prog}% · {countByProject(proj.id)} tareas
                        {proj.target_date ? ` · Meta ${fdate(proj.target_date)}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <ViewToggle projectId={proj.id} view={view} />
                      <SequenceButton
                        projectId={proj.id}
                        tasks={selectedTasks.map((t) => ({ id: t.id, title: t.title }))}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Progress pct={prog} kind={prog < 40 ? undefined : prog < 80 ? "warn" : undefined} />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <NewTaskForm projectId={proj.id} />
                  </div>
                  {!selectedTasks.length && <EmptyState icon="✅" text="Este proyecto no tiene tareas todavía." />}

                  {selectedTasks.length > 0 && view === "board" && (
                    <div style={{ marginTop: 10 }}>
                      <MondayBoard
                        projectId={proj.id}
                        initialTasks={selectedTasks.map(
                          (t): MondayTask => ({
                            id: t.id,
                            title: t.title,
                            status: t.status,
                            priority: t.priority,
                            urgent: t.urgent,
                            due: t.due,
                            startDate: t.startDate,
                            parentTaskId: t.parentTaskId,
                            groupId: t.groupId
                          })
                        )}
                        initialGroups={groups as MondayGroup[]}
                        assigneesByTask={assigneesByTask}
                        commentCountByTask={commentCountByTask}
                        members={members}
                      />
                    </div>
                  )}

                  {selectedTasks.length > 0 && view === "list" && (
                    <>
                      {selectedTasks.map((t) => (
                        <TaskDetailPanel key={t.id} taskId={t.id} taskTitle={t.title} />
                      ))}
                    </>
                  )}

                  {selectedTasks.length > 0 && view === "kanban" && (
                    <KanbanBoard
                      projectId={proj.id}
                      initialTasks={selectedTasks.map(
                        (t): KanbanTask => ({
                          id: t.id,
                          title: t.title,
                          status: t.status,
                          priority: t.priority,
                          urgent: t.urgent,
                          due: t.due
                        })
                      )}
                      assigneesByTask={assigneesByTask}
                    />
                  )}

                  {selectedTasks.length > 0 && view === "tree" && (
                    <TreeView
                      projectId={proj.id}
                      initialTasks={selectedTasks.map(
                        (t): TreeNodeTask => ({
                          id: t.id,
                          title: t.title,
                          status: t.status,
                          parent_task_id: t.parentTaskId,
                          group_id: t.groupId
                        })
                      )}
                      initialGroups={groups}
                    />
                  )}

                  {/* Bitácora + Base de conocimiento, siempre visibles al final
                     del bloque, sin importar la vista activa. */}
                  <div
                    className="grid gap-3.5"
                    style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 14 }}
                  >
                    <LogbookCard projectId={proj.id} entries={logbookEntries} />
                    <KnowledgeCard projectId={proj.id} items={knowledgeItems} />
                  </div>
                </div>
              </Card>
            );
          })()}
      </div>
    </div>
  );
}
