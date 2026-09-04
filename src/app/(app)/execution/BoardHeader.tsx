// Encabezado del tablero abierto: identidad del proyecto + acciones que
// aplican a TODO el proyecto (secuencia sugerida, editar, bitácora, base de
// conocimiento). Server Component puro.
import { Chip, Progress } from "@/components/ui";
import ProjectMenu, { type ProjectMenuData } from "./ProjectMenu";
import type { LogEntry, KnowledgeItem } from "./logbook-knowledge-actions";
import type { WorkspaceSummary } from "@/lib/data/workspaces";
import type { ProjectTemplate } from "@/lib/domain/execution/project-templates.ts";

export default function BoardHeader({
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
  return (
    <header className="ex-header">
      <h2 className="ex-header-title">{project.title}</h2>

      <div className="ex-header-main">
        <Chip kind={project.status === "Active" ? "accent" : project.status === "Completed" ? "ok" : ""}>{project.status}</Chip>
        <Chip kind={project.priority === "High" ? "bad" : project.priority === "Medium" ? "warn" : ""}>
          Prioridad {project.priority}
        </Chip>
        {targetDateLabel && <Chip>🎯 {targetDateLabel}</Chip>}
        {overdueCount > 0 && <Chip kind="bad">{overdueCount} vencida(s)</Chip>}
      </div>

      {project.objective && <p className="ex-header-objective text-sm">{project.objective}</p>}

      <div className="ex-header-progress">
        <Progress pct={progress} />
        <span className="text-xs">
          {progress}% · {openCount} abiertas de {taskCount}
        </span>
      </div>

      {/* Una sola acción visible. "✨ Sugerir secuencia" era un botón ancho
          permanente para algo que se usa de vez en cuando: ahora es una
          entrada del "⋯" y esta fila deja de estirarse por él. */}
      <div className="ex-header-actions">
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
    </header>
  );
}
