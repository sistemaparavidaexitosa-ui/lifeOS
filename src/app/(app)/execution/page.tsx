import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui";
import { fdate } from "@/lib/format";
import NewProjectForm from "./NewProjectForm";
import SequenceButton from "./SequenceButton";
import TaskDetailPanel from "./TaskDetailPanel";
import KanbanBoard, { type KanbanTask } from "./KanbanBoard";
import MondayBoard, { type MondayTask, type MondayGroup } from "./MondayBoard";
import TreeView, { type TreeGroup } from "./TreeView";
import type { TreeNodeTask } from "./TreeItemNode";
import ViewToggle, { type ExecutionView } from "./ViewToggle";
import ProjectMenu from "./ProjectMenu";
import ProjectRow, { type ProjectRowData } from "./ProjectRow";
import { getProjectLogAndKnowledge } from "./logbook-knowledge-actions";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";

// REDISEÑO Monday-style. Cambios de esta iteración:
//   PUNTO 2: LogbookCard y KnowledgeCard ya NO se muestran siempre al final de
//     la expansión. Junto con "Editar proyecto", ahora viven detrás de un
//     menú de tres puntitos (ProjectMenu.tsx) en el encabezado de cada
//     proyecto seleccionado, y se abren bajo demanda en un Drawer lateral.
//   PUNTO 3: se eliminó NewTaskForm (el botón "+ Tarea" que abría un
//     formulario). Ahora las tareas se agregan estilo Monday, en una fila tipo
//     hoja de cálculo dentro de cada grupo del Tablero (QuickAddRow, ya
//     existente en MondayBoard). Por eso, en la vista "board" el tablero se
//     renderiza SIEMPRE (incluso con 0 tareas): gracias al backfill de la
//     migración 0019 todo proyecto tiene al menos el grupo "General" con su
//     fila "+ Agregar tarea", así que un proyecto nuevo puede recibir su
//     primera tarea sin ningún formulario.
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

    if (view === "board" || view === "tree") {
      const { data: groupRows } = await supabase
        .from("task_groups")
        .select("id, name, color, position")
        .eq("project_id", selectedProjectId)
        .order("position");
      groups = groupRows ?? [];
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between wrap" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h2 className="font-bold text-lg">Proyectos y Tareas</h2>
        <NewProjectForm />
      </div>
      <div className="project-rows-list">
        {!projects?.length && (
          <Card>
            <EmptyState icon="📁" text="Crea tu primer proyecto." />
          </Card>
        )}
        {(projects ?? []).map((p) => {
          const isSelected = selectedProjectId === p.id;
          const rowData: ProjectRowData = {
            id: p.id,
            title: p.title,
            status: p.status,
            taskCount: countByProject(p.id),
            progress: progressByProject(p.id),
            targetDate: p.target_date
          };
          return (
            <div key={p.id} className={`project-row-wrap${isSelected ? " expanded" : ""}`}>
              <ProjectRow project={rowData} active={isSelected} formattedTargetDate={p.target_date ? fdate(p.target_date) : ""} />
              {isSelected && (
                <div className="project-row-expansion">
                  <div className="flex items-center justify-between wrap" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div className="flex items-center" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <ViewToggle projectId={p.id} view={view} />
                      <SequenceButton projectId={p.id} tasks={selectedTasks.map((t) => ({ id: t.id, title: t.title }))} />
                    </div>
                    {/* PUNTO 2: menú de tres puntitos (Editar proyecto / Bitácora /
                        Base de conocimiento). Reemplaza al botón "+ Tarea" (Punto 3),
                        cuya función ahora vive inline en el Tablero. */}
                    <ProjectMenu
                      project={{
                        id: p.id,
                        title: p.title,
                        objective: p.objective ?? "",
                        status: p.status,
                        priority: p.priority,
                        targetDate: p.target_date
                      }}
                      logbookEntries={logbookEntries}
                      knowledgeItems={knowledgeItems}
                    />
                  </div>

                  {/* PUNTO 3: la vista Tablero se renderiza SIEMPRE (incluso con 0
                      tareas) para exponer la fila "+ Agregar tarea" por grupo. */}
                  {view === "board" && (
                    <div style={{ marginTop: 10 }}>
                      <MondayBoard
                        projectId={p.id}
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

                  {view !== "board" && !selectedTasks.length && (
                    <EmptyState icon="✅" text="Este proyecto no tiene tareas todavía. Cambia a la vista Tablero para agregar una." />
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
                      projectId={p.id}
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
                      projectId={p.id}
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
