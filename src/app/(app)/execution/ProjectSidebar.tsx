"use client";
// Navegador de tableros (columna izquierda), equivalente al panel de Boards
// de monday.com / la Sidebar de Spaces de ClickUp.
//
// POR QUÉ REEMPLAZA AL ACORDEÓN ANTERIOR: antes los proyectos eran filas que
// se expandían "in situ"; con 10 proyectos, el tablero abierto quedaba
// hundido a mitad del scroll, cambiar de proyecto obligaba a colapsar el
// anterior y no había forma de buscar. Aquí la lista es siempre visible y
// angosta, con búsqueda y filtro por estado, y el área de trabajo queda fija
// a la derecha. En móvil se pliega a un botón "Cambiar de tablero".
import { useMemo, useState } from "react";
import Link from "next/link";
import { Progress } from "@/components/ui";

export interface SidebarProject {
  id: string;
  title: string;
  status: string;
  priority: string;
  progress: number;
  taskCount: number;
  openCount: number;
  overdueCount: number;
  targetDate: string | null;
  targetDateLabel: string;
}

const OPEN_STATUSES = ["Active", "Draft", "OnHold"];

export default function ProjectSidebar({
  projects,
  selectedId,
  view,
  children
}: {
  projects: SidebarProject[];
  selectedId: string | null;
  view: string;
  /** Botón "+ Nuevo proyecto" (Client Component, inyectado desde page.tsx). */
  children?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"open" | "all">("open");
  const [mobileOpen, setMobileOpen] = useState(!selectedId);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (text && !p.title.toLowerCase().includes(text)) return false;
      if (scope === "open" && !OPEN_STATUSES.includes(p.status)) return false;
      return true;
    });
  }, [projects, query, scope]);

  const selected = projects.find((p) => p.id === selectedId);

  return (
    <aside className={`ex-sidebar${mobileOpen ? " open" : ""}`}>
      <button type="button" className="ex-sidebar-toggle btn-ghost btn-sm" onClick={() => setMobileOpen((v) => !v)}>
        {mobileOpen ? "▾ Ocultar tableros" : `▸ Tableros${selected ? ` · ${selected.title}` : ""}`}
      </button>

      <div className="ex-sidebar-body">
        <div className="ex-sidebar-head">
          <b className="text-sm">Tableros</b>
          {children}
        </div>

        <input
          className="ex-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar tablero…"
          aria-label="Buscar tablero"
        />

        <div className="ex-scope">
          <button type="button" className={`ex-tab${scope === "open" ? " active" : ""}`} onClick={() => setScope("open")}>
            En curso
          </button>
          <button type="button" className={`ex-tab${scope === "all" ? " active" : ""}`} onClick={() => setScope("all")}>
            Todos ({projects.length})
          </button>
        </div>

        <nav className="ex-project-list">
          {visible.map((p) => {
            const active = p.id === selectedId;
            return (
              <Link
                key={p.id}
                href={`/execution?project=${p.id}&view=${view}`}
                className={`ex-project${active ? " active" : ""}`}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
              >
                <span className="ex-project-title">{p.title}</span>
                <span className="ex-project-meta text-xs">
                  {p.openCount} abiertas · {p.progress}%
                  {p.overdueCount > 0 && <b className="ex-project-late"> · {p.overdueCount} vencida(s)</b>}
                </span>
                <Progress pct={p.progress} />
                {p.targetDate && <span className="ex-project-meta text-xs">🎯 {p.targetDateLabel}</span>}
              </Link>
            );
          })}
          {!visible.length && <p className="text-xs ex-sidebar-empty">Sin tableros que coincidan.</p>}
        </nav>
      </div>
    </aside>
  );
}
