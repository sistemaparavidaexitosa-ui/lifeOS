"use client";
// Cartera de proyectos: TODOS los proyectos como filas tipo monday.com.
//
// POR QUÉ REEMPLAZA A ProjectSidebar + ProjectsOverview
// Entrar a /execution sin ?project= pintaba la MISMA lista dos veces, una al
// lado de la otra: el navegador lateral (título, abiertas, %, barra, meta) y
// el portafolio en tarjetas (título, estado, barra, abiertas, meta). Mismos
// proyectos, mismos datos, dos formatos y dos sitios donde hacer clic. Con
// cinco proyectos ya se leía como si hubiera diez.
//
// Ahora hay UNA sola representación, y es la del tablero: una fila por
// proyecto con las mismas columnas editables que una tarea. La fila reutiliza
// .mb-row / .mb-cols / .mb-row-meta de globals.css, así que hereda gratis el
// comportamiento responsive que ya se resolvió para las tareas — a partir de
// 860px la fila deja de ser rejilla y los metadatos fluyen envueltos, nunca
// una tabla con scroll horizontal.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconCalendar, IconTrash } from "@/components/icons";
import MenuSurface, { useMenuAnchor } from "@/components/MenuSurface";
import { PROJECT_OPEN_STATUSES, PROJECT_STATUS_META, PROJECT_STATUS_ORDER } from "./status-meta";
import { deleteProject, patchProject, type ProjectPatch } from "./actions";
import type { Priority, ProjectStatus } from "@/lib/domain/types.ts";

export interface PortfolioProject {
  id: string;
  title: string;
  status: ProjectStatus;
  priority: Priority;
  progress: number;
  taskCount: number;
  openCount: number;
  overdueCount: number;
  targetDate: string | null;
  targetDateLabel: string;
}

export default function PortfolioBoard({
  projects,
  view,
  workspaceName = "",
  workspaceNav,
  children
}: {
  projects: PortfolioProject[];
  /** Vista del tablero a la que se entra al abrir un proyecto. */
  view: string;
  /** Espacio de trabajo que se está viendo: la cartera es siempre la de UN espacio. */
  workspaceName?: string;
  /** Selector de espacio + panel de Equipo, a la izquierda de la barra. */
  workspaceNav?: React.ReactNode;
  /** Botón "+ Nuevo proyecto" (Client Component, inyectado desde page.tsx). */
  children?: React.ReactNode;
}) {
  // Copia local para poder aplicar los cambios de estado/prioridad/fecha de
  // forma optimista. Se resincroniza cuando el servidor revalida.
  const [rows, setRows] = useState(projects);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"open" | "all">("open");

  useEffect(() => setRows(projects), [projects]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return rows.filter((p) => {
      if (text && !p.title.toLowerCase().includes(text)) return false;
      if (scope === "open" && !PROJECT_OPEN_STATUSES.includes(p.status)) return false;
      return true;
    });
  }, [rows, query, scope]);

  function remove(project: PortfolioProject) {
    const detail = project.taskCount > 0 ? ` y sus ${project.taskCount} tarea(s)` : "";
    if (!window.confirm(`¿Eliminar "${project.title}"${detail}? Esta acción no se puede deshacer.`)) return;

    const previous = rows;
    setRows((prev) => prev.filter((p) => p.id !== project.id));
    deleteProject(project.id).catch((e) => {
      setRows(previous);
      setError(e instanceof Error ? e.message : "No se pudo eliminar el proyecto");
    });
  }

  function apply(id: string, patch: ProjectPatch) {
    const previous = rows;
    setRows((prev) =>
      prev.map((p) =>
        p.id !== id
          ? p
          : {
              ...p,
              status: patch.status ?? p.status,
              priority: patch.priority ?? p.priority,
              targetDate: patch.targetDate !== undefined ? patch.targetDate : p.targetDate,
              targetDateLabel:
                patch.targetDate !== undefined ? formatTargetDate(patch.targetDate) : p.targetDateLabel
            }
      )
    );
    patchProject(id, patch).catch((e) => {
      // Revertir es obligatorio: si no, la fila enseña un estado que la base
      // no tiene y el siguiente refresco lo "deshace" sin explicación.
      setRows(previous);
      setError(e instanceof Error ? e.message : "No se pudo guardar el cambio");
    });
  }

  if (!rows.length) {
    return (
      <div className="ex-portfolio">
        <div className="ex-portfolio-bar">
          {workspaceNav}
          <span className="ex-portfolio-spacer" />
          {children}
        </div>
        <div className="card">
          <div className="text-center py-6" style={{ color: "var(--muted)" }}>
            <div className="text-3xl mb-1.5">📁</div>
            {/* El estado vacío nombra el espacio: con varios espacios, un
                "crea tu primer proyecto" a secas hacía dudar de si el sitio
                estaba vacío o se estaba mirando el espacio equivocado. */}
            {workspaceName ? `«${workspaceName}» todavía no tiene proyectos.` : "Crea tu primer proyecto para empezar a trabajar."}
          </div>
        </div>
      </div>
    );
  }

  const totalOpen = rows.reduce((sum, p) => sum + p.openCount, 0);
  const totalOverdue = rows.reduce((sum, p) => sum + p.overdueCount, 0);
  const avgProgress = Math.round(rows.reduce((sum, p) => sum + p.progress, 0) / rows.length);

  return (
    <div className="ex-portfolio">
      <div className="ex-portfolio-bar">
        {workspaceNav}
        <input
          className="ex-search ex-portfolio-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar proyecto…"
          aria-label="Buscar proyecto"
        />
        <div className="ex-scope">
          <button type="button" className={`ex-tab${scope === "open" ? " active" : ""}`} onClick={() => setScope("open")}>
            En curso
          </button>
          <button type="button" className={`ex-tab${scope === "all" ? " active" : ""}`} onClick={() => setScope("all")}>
            Todos ({rows.length})
          </button>
        </div>
        <span className="ex-portfolio-spacer" />
        {children}
      </div>

      {error && (
        <div className="ex-alert" role="alert">
          {error}
        </div>
      )}

      <div className="lp-lista">
        <div className="lp-resumen">
          {visible.length} {visible.length === 1 ? "proyecto" : "proyectos"} · {totalOpen} tareas abiertas
          {totalOverdue > 0 ? ` · ${totalOverdue} vencidas` : ""} · {avgProgress}% de avance
        </div>
        {visible.map((p) => (
          <ProjectRow key={p.id} project={p} view={view} onPatch={(patch) => apply(p.id, patch)} onDelete={() => remove(p)} />
        ))}
        {!visible.length && <p className="ln-vacio">Ningún proyecto coincide con la búsqueda.</p>}
      </div>
    </div>
  );
}

/**
 * Una fila de proyecto (rediseño, estilo Linear): el anillo dice cuánto va, el
 * título abre la lista de tareas, y a la derecha solo lo que se cambia sin
 * entrar: estado y fecha meta. La prioridad vive en la cabecera del proyecto.
 */
function ProjectRow({
  project,
  view,
  onPatch,
  onDelete
}: {
  project: PortfolioProject;
  view: string;
  onPatch: (patch: ProjectPatch) => void;
  onDelete: () => void;
}) {
  return (
    <div className="lp-fila">
      <Link href={`/execution?project=${project.id}${view !== "lista" ? `&view=${view}` : ""}`} className="lp-principal">
        <AnilloDeAvance pct={project.progress} />
        <span className="lp-titulo">{project.title}</span>
        <span className="lp-cuenta">
          {project.taskCount - project.openCount}/{project.taskCount}
        </span>
        {project.overdueCount > 0 && <span className="lp-vencidas">{project.overdueCount} vencidas</span>}
      </Link>
      <span className="lp-meta">
        <ProjectStatusPill status={project.status} onChange={(status) => onPatch({ status })} />
        <ProjectTargetPill targetDate={project.targetDate} label={project.targetDateLabel} onChange={(targetDate) => onPatch({ targetDate })} />
        <button type="button" className="lp-borrar" onClick={onDelete} title={`Eliminar ${project.title}`} aria-label={`Eliminar proyecto ${project.title}`}>
          <IconTrash width={15} height={15} />
        </button>
      </span>
    </div>
  );
}

function AnilloDeAvance({ pct }: { pct: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-label={`${pct}% de avance`} role="img" className="flex-none -rotate-90">
      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--surface3)" strokeWidth="2.2" />
      <circle cx="9" cy="9" r={r} fill="none" stroke={pct >= 100 ? "var(--ok)" : "var(--text)"} strokeWidth="2.2" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
    </svg>
  );
}

function ProjectStatusPill({ status, onChange }: { status: ProjectStatus; onChange: (s: ProjectStatus) => void }) {
  const menu = useMenuAnchor();
  const meta = PROJECT_STATUS_META[status];

  return (
    <div className="mb-menu-wrap">
      <button
        type="button"
        className="lp-estado"
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title="Cambiar estado del proyecto"
      >
        <span className="lp-punto" style={{ background: meta.color }} />
        {meta.label}
      </button>
      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} label="Cambiar estado del proyecto">
          <div className="ln-menu">
            {PROJECT_STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                className="ln-menu-item"
                onClick={() => {
                  menu.close();
                  if (s !== status) onChange(s);
                }}
              >
                <span className="lp-punto" style={{ background: PROJECT_STATUS_META[s].color }} />
                {PROJECT_STATUS_META[s].label}
              </button>
            ))}
          </div>
        </MenuSurface>
      )}
    </div>
  );
}

function formatTargetDate(date: string | null): string {
  if (!date) return "";
  return new Date(`${date}T00:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function ProjectTargetPill({
  targetDate,
  label,
  onChange
}: {
  targetDate: string | null;
  label: string;
  onChange: (date: string | null) => void;
}) {
  const menu = useMenuAnchor();
  const [draft, setDraft] = useState(targetDate ?? "");

  // El borrador se reabre con lo que hay guardado, no con lo que se tecleó y
  // se abandonó la vez anterior.
  useEffect(() => setDraft(targetDate ?? ""), [targetDate]);

  return (
    <div className="mb-menu-wrap">
      <button
        type="button"
        className="mb-timeline"
        onClick={menu.toggle}
        aria-expanded={menu.open}
        title="Editar fecha meta"
      >
        <IconCalendar width={14} height={14} />
        {targetDate ? label || formatTargetDate(targetDate) : "Sin meta"}
      </button>
      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} align="end" width={230} className="mb-dates" label="Editar fecha meta">
          <label className="text-xs">Fecha meta</label>
          <input type="date" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="mb-dates-actions">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                menu.close();
                onChange(null);
              }}
            >
              Sin meta
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => {
                menu.close();
                onChange(draft || null);
              }}
            >
              Guardar
            </button>
          </div>
        </MenuSurface>
      )}
    </div>
  );
}
