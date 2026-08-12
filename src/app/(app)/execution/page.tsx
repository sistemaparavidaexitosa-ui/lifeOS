import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, Progress, EmptyState } from "@/components/ui";
import { fdate } from "@/lib/format";
import NewProjectForm from "./NewProjectForm";
import NewTaskForm from "./NewTaskForm";
import TaskStatusButtons from "./TaskStatusButtons";
import SequenceButton from "./SequenceButton";
import type { TaskStatus } from "@/lib/domain/types.ts";

export default async function ExecutionPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project: selectedProjectId } = await searchParams;
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

  let selectedTasks: { id: string; title: string; status: TaskStatus; priority: string; due: string | null; est: number }[] = [];
  if (selectedProjectId) {
    const { data } = await supabase.from("tasks").select("*").eq("project_id", selectedProjectId).order("created_at");
    selectedTasks = (data ?? []) as typeof selectedTasks;
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold">Proyectos</h3>
      </div>

      <div className="grid md:grid-cols-3 gap-3.5">
        {!projects?.length && <EmptyState icon="📁" text="Crea tu primer proyecto." />}
        {(projects ?? []).map((p) => {
          const prog = progressByProject(p.id);
          const isSelected = selectedProjectId === p.id;
          return (
            <Link
              key={p.id}
              href={isSelected ? "/execution" : `/execution?project=${p.id}`}
              className="card block"
              style={isSelected ? { outline: "2px solid var(--accent)" } : undefined}
            >
              <div className="flex items-center justify-between">
                <Chip kind={p.status === "Active" ? "accent" : p.status === "Completed" ? "ok" : undefined}>{p.status}</Chip>
                <Chip>Personal</Chip>
              </div>
              <h3 className="mt-2 mb-0.5 font-bold">{p.title}</h3>
              <p className="text-sm truncate" style={{ color: "var(--muted)" }}>
                {p.objective || "—"}
              </p>
              <div className="my-2">
                <Progress pct={prog} />
              </div>
              <div className="flex justify-between text-xs" style={{ color: "var(--muted)" }}>
                <span>
                  {prog}% · {countByProject(p.id)} tareas
                </span>
                <span>{p.target_date ? `Meta ${fdate(p.target_date)}` : ""}</span>
              </div>
            </Link>
          );
        })}
      </div>

      <NewProjectForm />

      {selectedProjectId && (
        <Card className="bg-[var(--surface2)]">
          {(() => {
            const proj = projects?.find((p) => p.id === selectedProjectId);
            if (!proj) return <EmptyState icon="❓" text="Proyecto no encontrado." />;
            return (
              <>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-bold">Tareas de: {proj.title}</h3>
                  <SequenceButton projectId={proj.id} tasks={selectedTasks.map((t) => ({ id: t.id, title: t.title }))} />
                </div>
                <NewTaskForm projectId={proj.id} />
                <div className="mt-3 flex flex-col gap-1">
                  {!selectedTasks.length && <EmptyState icon="🗒" text="Este proyecto no tiene tareas todavía." />}
                  {selectedTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
                      <div className="grow min-w-0">
                        <b className="block truncate">{t.title}</b>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {t.priority} · {t.est} min{t.due ? ` · vence ${fdate(t.due)}` : ""}
                        </div>
                      </div>
                      <span className={`badge-state s-${t.status}`}>{t.status}</span>
                      <TaskStatusButtons taskId={t.id} status={t.status} />
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </Card>
      )}
    </div>
  );
}
