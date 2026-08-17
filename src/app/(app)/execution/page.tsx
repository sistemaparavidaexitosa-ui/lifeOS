import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, Progress, EmptyState } from "@/components/ui";
import { fdate } from "@/lib/format";
import NewProjectForm from "./NewProjectForm";
import NewTaskForm from "./NewTaskForm";
import SequenceButton from "./SequenceButton";
import TaskDetailPanel from "./TaskDetailPanel";
import KanbanBoard, { type KanbanTask } from "./KanbanBoard";
import MondayBoard, { type MondayTask } from "./MondayBoard";
import TreeView, { type TreeGroup } from "./TreeView";
import type { TreeNodeTask } from "./TreeItemNode";
import ViewToggle, { type ExecutionView } from "./ViewToggle";
import LogbookCard from "./LogbookCard";
import KnowledgeCard from "./KnowledgeCard";
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
//      0019). TreeView es autosuficiente (como MondayBoard/KanbanBoard): solo
//      recibe initialTasks/initialGroups, sin callbacks desde este Server
//      Component.
const GROUP_COLORS = ["var(--c-purple)", "var(--c-green)", "var(--c-orange)", "var(--c-pink)", "var(--c-teal)", "var(--c-blue)"];

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

    // FASE 4 (Tree View): task_groups del proyecto. Gracias al backfill
    // idempotente de la migración 0019, todo proyecto ya tiene al menos el
    // grupo "General" — nunca vendrá vacío.
    if (view === "tree") {
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
        <h2 className="font-bold text-lg">Proyectos</h2>
        <NewProjectForm />
      </div>

      <div className="grid gap-3.5" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {!projects?.length && <EmptyState icon="📁" text="Crea tu primer proyecto." />}
        {(projects ?? []).map((p, idx) => {
          const prog = progressByProject(p.id);
          const isSelected = selectedProjectId === p.id;
          const color = GROUP_COLORS[idx % GROUP_COLORS.length];
          return (
            <Card key={p.id} className="relative overflow-hidden">
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: color }} />
              <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between" }}>
                <Chip kind={p.status === "Active" ? "accent" : p.status === "Completed" ? "ok" : ""}>{p.status}</Chip>
                <Chip>{p.workspace_id ? "Workspace" : "Personal"}</Chip>
              </div>
              <h3 style={{ margin: "8px 0 2px" }}>{p.title}</h3>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {p.objective || "—"}
              </p>
              <Progress pct={prog} kind={prog < 40 ? undefined : prog < 80 ? "warn" : undefined} />
              <div className="flex items-center justify-between text-xs" style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", marginTop: 6 }}>
                <span>
                  {prog}% · {countByProject(p.id)} tareas
                </span>
                <span>{p.target_date ? `Meta ${fdate(p.target_date)}` : ""}</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <Link href={`/execution?project=${p.id}`} className="btn-ghost btn-sm">
                  {isSelected ? "✓ Viendo tareas" : "Ver tareas"}
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {selectedProjectId &&
        (() => {
          const projIdx = (projects ?? []).findIndex((p) => p.id === selectedProjectId);
          const proj = projects?.find((p) => p.id === selectedProjectId);
          if (!proj) return null;
          const groupColor = GROUP_COLORS[Math.max(0, projIdx) % GROUP_COLORS.length];
          return (
            <Card>
              <div style={{ background: "var(--surface2)", margin: "-16px", padding: 16, borderRadius: "inherit" }}>
                <div className="flex items-center justify-between wrap" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <h3>Tareas de: {proj.title}</h3>
                  <div className="flex items-center" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <ViewToggle projectId={proj.id} view={view} />
                    <SequenceButton
                      projectId={proj.id}
                      tasks={selectedTasks.map((t) => ({ id: t.id, title: t.title }))}
                    />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <NewTaskForm projectId={proj.id} />
                </div>
                {!selectedTasks.length && <EmptyState icon="✅" text="Este proyecto no tiene tareas todavía." />}

                {selectedTasks.length > 0 && view === "board" && (
                  <div style={{ marginTop: 10 }}>
                    <MondayBoard
                      projectId={proj.id}
                      groupColor={groupColor}
                      initialTasks={selectedTasks.map(
                        (t): MondayTask => ({
                          id: t.id,
                          title: t.title,
                          status: t.status,
                          priority: t.priority,
                          urgent: t.urgent,
                          due: t.due,
                          startDate: t.startDate,
                          parentTaskId: t.parentTaskId
                        })
                      )}
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
  );
}
