// Pantalla de entrada cuando no hay ningún tablero seleccionado: portafolio
// de proyectos con su avance real, tareas abiertas y vencidas.
//
// Antes, entrar a /execution sin ?project= mostraba solo una lista de filas
// sin ninguna lectura del portafolio; había que abrir proyecto por proyecto
// para saber cuál estaba en problemas. Server Component puro (sin estado).
import Link from "next/link";
import { Card, EmptyState, Progress, Stat } from "@/components/ui";
import type { SidebarProject } from "./ProjectSidebar";

export default function ProjectsOverview({ projects, view }: { projects: SidebarProject[]; view: string }) {
  if (!projects.length) {
    return (
      <Card>
        <EmptyState icon="📁" text="Crea tu primer tablero para empezar a trabajar tus proyectos." />
      </Card>
    );
  }

  const active = projects.filter((p) => p.status === "Active");
  const totalOpen = projects.reduce((sum, p) => sum + p.openCount, 0);
  const totalOverdue = projects.reduce((sum, p) => sum + p.overdueCount, 0);
  const avgProgress = Math.round(projects.reduce((sum, p) => sum + p.progress, 0) / projects.length);

  return (
    <div className="ex-overview">
      <div className="ex-overview-stats">
        <Stat label="Tableros activos" value={active.length} />
        <Stat label="Tareas abiertas" value={totalOpen} />
        <Stat label="Vencidas" value={totalOverdue} kind={totalOverdue > 0 ? "bad" : undefined} />
        <Stat label="Avance promedio" value={`${avgProgress}%`} />
      </div>

      <h3 className="text-sm ex-overview-title">Selecciona un tablero para trabajar</h3>
      <div className="ex-overview-grid">
        {projects.map((p) => (
          <Link key={p.id} href={`/execution?project=${p.id}&view=${view}`} className="ex-overview-card card">
            <div className="ex-overview-card-head">
              <b>{p.title}</b>
              <span className={`chip ${p.status === "Active" ? "accent" : p.status === "Completed" ? "ok" : ""}`}>{p.status}</span>
            </div>
            <Progress pct={p.progress} />
            <span className="text-xs ex-overview-meta">
              {p.progress}% · {p.openCount} abiertas de {p.taskCount}
              {p.overdueCount > 0 && <b className="ex-project-late"> · {p.overdueCount} vencida(s)</b>}
            </span>
            {p.targetDate && <span className="text-xs ex-overview-meta">🎯 Meta {p.targetDateLabel}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
