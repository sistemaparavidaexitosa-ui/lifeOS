// Fila de proyecto estilo Monday (equivalente a una fila de "Board" en el
// selector de tableros de monday.com): NO es una tarjeta ni un panel
// lateral. Es una fila angosta con barra de progreso, chip de estado y
// contador de tareas. Al hacer clic, navega a ?project=ID — page.tsx
// entonces expande las tareas de ESE proyecto INMEDIATAMENTE DEBAJO de esta
// misma fila (acordeón), no en un panel separado ni al final del listado.
//
// Server Component puro (solo <Link>, sin estado) — el mismo patrón que
// ViewToggle.tsx.
import Link from "next/link";
import { Chip, Progress } from "@/components/ui";

export interface ProjectRowData {
  id: string;
  title: string;
  status: string;
  taskCount: number;
  progress: number;
  targetDate: string | null;
}

export default function ProjectRow({
  project,
  active,
  formattedTargetDate
}: {
  project: ProjectRowData;
  active: boolean;
  formattedTargetDate: string;
}) {
  return (
    <Link
      href={active ? "/execution" : `/execution?project=${project.id}`}
      className={`project-row${active ? " active" : ""}`}
    >
      <span className="project-row-expand">{active ? "▾" : "▸"}</span>
      <span className="project-row-title">{project.title}</span>
      <Chip kind={project.status === "Active" ? "accent" : project.status === "Completed" ? "ok" : ""}>{project.status}</Chip>
      <span className="project-row-progress">
        <Progress pct={project.progress} kind={project.progress < 40 ? undefined : project.progress < 80 ? "warn" : undefined} />
      </span>
      <span className="project-row-meta">
        {project.progress}% · {project.taskCount} tareas
      </span>
      <span className="project-row-meta project-row-date">{project.targetDate ? `Meta ${formattedTargetDate}` : ""}</span>
    </Link>
  );
}
