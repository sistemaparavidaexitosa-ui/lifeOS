// Cabecera del proyecto abierto. Server Component puro.
//
// Arriba, el camino de vuelta; luego el título grande con el anillo de avance
// a su lado y una sola línea de contexto (estado · meta · lo vencido). El
// objetivo, si lo hay, debajo y en gris. Todo lo que se HACE con el proyecto
// vive en el «⋯»: la cabecera informa, no ofrece diez botones.
import Link from "next/link";
import { PRIORITY_META, PROJECT_STATUS_META } from "./status-meta";
import type { Priority, ProjectStatus } from "@/lib/domain/types.ts";
import ProjectMenu, { type ProjectMenuData } from "./ProjectMenu";
import type { LogEntry, KnowledgeItem } from "./logbook-knowledge-actions";
import type { WorkspaceSummary } from "@/lib/data/workspaces";
import type { ProjectTemplate } from "@/lib/domain/execution/project-templates.ts";
import { Anillo } from "./ui/iconos";

export default function BoardHeader({
  backHref,
  project,
  progress,
  taskCount,
  openCount,
  overdueCount,
  targetDateLabel,
  sequenceTasks,
  logbookEntries,
  knowledgeItems,
  workspaces,
  currentWorkspaceId,
  guestAccess,
  workspaceIsPersonal,
  templates
}: {
  /** A la cartera del espacio DEL PROYECTO (ver page.tsx). */
  backHref: string;
  project: ProjectMenuData;
  progress: number;
  taskCount: number;
  openCount: number;
  overdueCount: number;
  targetDateLabel: string;
  sequenceTasks: { id: string; title: string }[];
  logbookEntries: LogEntry[];
  knowledgeItems: KnowledgeItem[];
  /** Espacios donde el usuario puede escribir: destinos válidos para mover. */
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string;
  /** Nivel del share vigente, o null si ningún invitado alcanza el proyecto. */
  guestAccess: string | null;
  workspaceIsPersonal: boolean;
  /** El catálogo publicado, de camino al menú del proyecto. */
  templates: ProjectTemplate[];
}) {
  const estado = PROJECT_STATUS_META[project.status as ProjectStatus];
  const hechas = taskCount - openCount;

  return (
    <header className="xr-cabecera">
      <div className="xr-cabecera-arriba">
        {/* Sin navegador lateral, este es el único camino de vuelta: no puede
            faltar ni esconderse tras un menú. */}
        <Link href={backHref} className="xr-volver">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Proyectos
        </Link>
        <ProjectMenu
          project={project}
          taskCount={taskCount}
          sequenceTasks={sequenceTasks}
          logbookEntries={logbookEntries}
          knowledgeItems={knowledgeItems}
          workspaces={workspaces}
          currentWorkspaceId={currentWorkspaceId}
          guestAccess={guestAccess}
          workspaceIsPersonal={workspaceIsPersonal}
          templates={templates}
        />
      </div>

      <div className="xr-cabecera-principal">
        <div className="xr-cabecera-texto">
          <h1 className="xr-cabecera-titulo">{project.title}</h1>
          <p className="xr-cabecera-linea">
            <span className="xr-punto" style={{ background: estado?.color }} />
            {estado?.label ?? project.status}
            {targetDateLabel && <span>Meta {targetDateLabel}</span>}
            {project.priority === "High" && <span>Prioridad {PRIORITY_META[project.priority as Priority].label.toLowerCase()}</span>}
            {overdueCount > 0 && (
              <span className="xr-tono-vencida">
                {overdueCount} {overdueCount === 1 ? "vencida" : "vencidas"}
              </span>
            )}
          </p>
        </div>
        <div className="xr-cabecera-avance">
          <Anillo pct={progress} size={52} grosor={4} />
          <span className="xr-cabecera-pct">{progress}%</span>
          <span className="xr-cabecera-cuenta">
            {hechas} de {taskCount}
          </span>
        </div>
      </div>

      {project.objective && <p className="xr-cabecera-objetivo">{project.objective}</p>}
    </header>
  );
}
