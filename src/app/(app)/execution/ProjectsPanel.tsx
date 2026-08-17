"use client";
// Panel de Proyectos (Boards), estilo monday.com: lista angosta a la
// izquierda del contenido, seleccionar un board navega a ?project=ID y
// muestra sus tareas a la derecha — reemplaza la cuadrícula de tarjetas que
// existía antes en execution/page.tsx.
//
// Embebe NewProjectForm (ya convertido a botón toggle) como el "+" de la
// cabecera del panel, mismo patrón que "+ Nuevo grupo" en Tree View.
import Link from "next/link";
import NewProjectForm from "./NewProjectForm";

export interface PanelProject {
  id: string;
  title: string;
  status: string;
  priority: string;
  progress: number;
  taskCount: number;
}

const STATUS_DOT: Record<string, string> = {
  Draft: "var(--muted)",
  Active: "var(--c-purple)",
  OnHold: "var(--warn)",
  Completed: "var(--ok)",
  Cancelled: "var(--danger)",
  Archived: "var(--muted)"
};

export default function ProjectsPanel({
  projects,
  selectedProjectId
}: {
  projects: PanelProject[];
  selectedProjectId: string | null;
}) {
  return (
    <div className="projects-panel">
      <div className="projects-panel-head">
        <b>Proyectos</b>
        <NewProjectForm />
      </div>
      <div className="projects-panel-list">
        {!projects.length && (
          <p className="text-xs" style={{ color: "var(--muted)", padding: "8px 4px" }}>
            Crea tu primer proyecto.
          </p>
        )}
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/execution?project=${p.id}`}
            className={`projects-panel-item${selectedProjectId === p.id ? " active" : ""}`}
            title={p.title}
          >
            <span className="projects-panel-dot" style={{ background: STATUS_DOT[p.status] ?? "var(--muted)" }} />
            <span className="projects-panel-title">{p.title}</span>
            <span className="projects-panel-count">{p.taskCount}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
