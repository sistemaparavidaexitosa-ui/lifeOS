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
import { Progress } from "@/components/ui";
import { IconCalendar } from "@/components/icons";
import MenuSurface, { useMenuAnchor } from "./MenuSurface";
import { PRIORITY_META, PRIORITY_ORDER, PROJECT_OPEN_STATUSES, PROJECT_STATUS_META, PROJECT_STATUS_ORDER } from "./status-meta";
import { patchProject, type ProjectPatch } from "./actions";
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
  children
}: {
  projects: PortfolioProject[];
  /** Vista del tablero a la que se entra al abrir un proyecto. */
  view: string;
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
          <b className="text-sm">Proyectos</b>
          {children}
        </div>
        <div className="card">
          <div className="text-center py-6" style={{ color: "var(--muted)" }}>
            <div className="text-3xl mb-1.5">📁</div>
            Crea tu primer proyecto para empezar a trabajar.
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

      {/* .mb-board fija las columnas vía --mb-cols; aquí se redefine porque la
          cartera no tiene "Personas" sino "Avance". */}
      <div className="mb-board ex-portfolio-board">
        <div className="mb-group">
          <div className="mb-group-head">
            <span className="mb-group-name">Proyectos</span>
            <span className="mb-group-pct">
              {visible.length} de {rows.length} · {totalOpen} tareas abiertas
              {totalOverdue > 0 ? ` · ${totalOverdue} vencidas` : ""} · {avgProgress}% promedio
            </span>
          </div>

          <div className="mb-cols">
            <span>Proyecto</span>
            <span className="mb-col-center">Estado</span>
            <span className="mb-col-center">Prioridad</span>
            <span className="mb-col-center">Avance</span>
            <span className="mb-col-center">Meta</span>
          </div>

          {visible.map((p) => (
            <ProjectRow key={p.id} project={p} view={view} onPatch={(patch) => apply(p.id, patch)} />
          ))}

          {!visible.length && <p className="mb-empty">Ningún proyecto coincide con la búsqueda.</p>}
        </div>
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  view,
  onPatch
}: {
  project: PortfolioProject;
  view: string;
  onPatch: (patch: ProjectPatch) => void;
}) {
  return (
    <div className="mb-row">
      <div className="mb-row-item">
        {/* El título ES el enlace al tablero. No hay un segundo sitio donde
            abrir el proyecto: la fila es la lista y el navegador a la vez. */}
        <Link href={`/execution?project=${project.id}&view=${view}`} className="ex-portfolio-title">
          {project.title}
        </Link>
        <span className="ex-portfolio-count">
          {project.openCount} abiertas de {project.taskCount}
        </span>
        {project.overdueCount > 0 && (
          <span className="chip bad mb-urgent">{project.overdueCount} vencidas</span>
        )}
      </div>

      <div className="mb-row-meta">
        <div className="mb-cell">
          <ProjectStatusPill status={project.status} onChange={(status) => onPatch({ status })} />
        </div>
        <div className="mb-cell">
          <ProjectPriorityPill priority={project.priority} onChange={(priority) => onPatch({ priority })} />
        </div>
        <div className="mb-cell ex-portfolio-progress">
          <Progress pct={project.progress} />
          <b>{project.progress}%</b>
        </div>
        <div className="mb-cell">
          <ProjectTargetPill
            targetDate={project.targetDate}
            label={project.targetDateLabel}
            onChange={(targetDate) => onPatch({ targetDate })}
          />
        </div>
      </div>
    </div>
  );
}

function ProjectStatusPill({ status, onChange }: { status: ProjectStatus; onChange: (s: ProjectStatus) => void }) {
  const menu = useMenuAnchor();
  const meta = PROJECT_STATUS_META[status];

  return (
    <div className="mb-menu-wrap">
      <button
        type="button"
        className="mb-pill"
        style={{ background: meta.color }}
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title="Cambiar estado del proyecto"
      >
        {meta.label}
      </button>
      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} label="Cambiar estado del proyecto">
          <div className="ex-menu-list">
            {PROJECT_STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                className="mb-pill"
                style={{ background: PROJECT_STATUS_META[s].color }}
                onClick={() => {
                  menu.close();
                  if (s !== status) onChange(s);
                }}
              >
                {PROJECT_STATUS_META[s].label}
              </button>
            ))}
          </div>
        </MenuSurface>
      )}
    </div>
  );
}

function ProjectPriorityPill({ priority, onChange }: { priority: Priority; onChange: (p: Priority) => void }) {
  const menu = useMenuAnchor();
  const meta = PRIORITY_META[priority];

  return (
    <div className="mb-menu-wrap">
      <button
        type="button"
        className="mb-pill soft"
        style={{ background: meta.soft, color: meta.color }}
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title="Cambiar prioridad del proyecto"
      >
        {meta.label}
      </button>
      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} label="Cambiar prioridad del proyecto">
          <div className="ex-menu-list">
            {PRIORITY_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                role="menuitem"
                className="mb-pill soft"
                style={{ background: PRIORITY_META[p].soft, color: PRIORITY_META[p].color }}
                onClick={() => {
                  menu.close();
                  if (p !== priority) onChange(p);
                }}
              >
                {PRIORITY_META[p].label}
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
