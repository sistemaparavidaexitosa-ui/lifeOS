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
import TaskTable, { type TableTask } from "./TaskTable";
import ViewToggle, { type ExecutionView } from "./ViewToggle";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";

// FASE 3 — cambios respecto a la Fase 2:
//   1. Se agrega la vista "table" (además de "list" y "kanban") vía
//      searchParams.view.
//   2. La consulta a task_assignees (antes solo para Kanban) ahora se
//      dispara para Kanban O Tabla, ya que ambas vistas necesitan mostrar
//      "Responsables" por tarea.
//   3. Se importa y renderiza <TaskTable> cuando view === "table".
// El bloque "Tareas de: {proyecto}" sigue sin usar `style` directo sobre
// <Card> (fix ya aplicado en Fase 2 para el error TS2322).
export default async function ExecutionPage({
  searchParams
}: {
  searchParams: Promise<{ project?: string; view?: string }>;
}) {
  const { project: selectedProjectId, view: rawView } = await searchParams;
  const view: ExecutionView = rawView === "kanban" ? "kanban" : rawView === "table" ? "table" : "list";

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
  const { data: allTasks } = await supabase.from("tasks").select("id, project_id, status");

  const progressByProject = (projectId: string) => {
    const ts = (allTasks ?? []).filter((t) => t.project_id === projectId && t.status !== "Cancelled");
    if (!ts.length) return 0;
    return Math.round((ts.filter((t) => t.status === "Completed").length / ts.length) * 100);
  };
  const countByProject = (projectId: string) => (allTasks ?? []).filter((t) => t.project_id === projectId).length;

  let selectedTasks: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: Priority;
    due: string | null;
    est: number;
    urgent: boolean;
  }[] = [];
  let assigneesByTask: Record<string, string[]> = {};

  if (selectedProjectId) {
    const { data } = await supabase.from("tasks").select("*").eq("project_id", selectedProjectId).order("created_at");
    selectedTasks = (data ?? []) as typeof selectedTasks;

    // Responsables: se necesitan tanto en Kanban (chip "👤 nombre" en cada
    // tarjeta) como en Tabla (columna "Responsables"). La vista de Lista no
    // los precarga aquí — los muestra el propio TaskDetailPanel al abrir.
    if ((view === "kanban" || view === "table") && selectedTasks.length) {
      const { data: assigneeRows } = await supabase
        .from("task_assignees")
        .select("task_id, user_name")
        .in(
          "task_id",
          selectedTasks.map((t) => t.id)
        );
      assigneesByTask = (assigneeRows ?? []).reduce<Record<string, string[]>>((acc, row) => {
        (acc[row.task_id] ??= []).push(row.user_name);
        return acc;
      }, {});
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
        {(projects ?? []).map((p) => {
          const prog = progressByProject(p.id);
          const isSelected = selectedProjectId === p.id;
          return (
            <Card key={p.id}>
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
          const proj = projects?.find((p) => p.id === selectedProjectId);
          if (!proj) return null;
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

                {selectedTasks.length > 0 && view === "list" && (
                  <>
                    {selectedTasks.map((t) => (
                      <TaskDetailPanel key={t.id} taskId={t.id} taskTitle={t.title} />
                    ))}
                  </>
                )}

                {selectedTasks.length > 0 && view === "table" && (
                  <TaskTable
                    projectTitle={proj.title}
                    tasks={selectedTasks.map(
                      (t): TableTask => ({
                        id: t.id,
                        title: t.title,
                        status: t.status,
                        priority: t.priority,
                        due: t.due,
                        est: t.est
                      })
                    )}
                    assigneesByTask={assigneesByTask}
                  />
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
              </div>
            </Card>
          );
        })()}
    </div>
  );
}
