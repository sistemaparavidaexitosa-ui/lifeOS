import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EisenhowerBoard from "./Board";

export default async function EisenhowerPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, urgent, priority, status")
    .not("status", "in", "(Completed,Cancelled)");

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface))", borderLeft: "3px solid var(--accent)" }}>
        Arrastra tus tareas entre cuadrantes para reclasificar urgencia e importancia, igual que en el Kanban (FR-VIEW-007).
      </div>
      <EisenhowerBoard
        tasks={(tasks ?? []).map((t) => ({ id: t.id, title: t.title, urgent: t.urgent, priority: t.priority as "High" | "Medium" | "Low" }))}
      />
      <div className="text-xs p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--info) 9%, var(--surface))", borderLeft: "3px solid var(--info)" }}>
        Mover una tarea a un cuadrante distinto actualiza su urgencia y/o prioridad y queda registrado en su historial (BR-023). No
        se pueden reclasificar tareas completadas o canceladas.
      </div>
    </div>
  );
}
