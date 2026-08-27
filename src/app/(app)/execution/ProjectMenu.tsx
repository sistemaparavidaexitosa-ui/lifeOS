"use client";
// Punto 2 — Menú de tres puntitos por proyecto.
//
// Reemplaza la exhibición SIEMPRE-VISIBLE de LogbookCard + KnowledgeCard al
// final de la expansión del proyecto (en page.tsx). Ahora esas 2 tarjetas —
// más "Editar proyecto" — viven detrás de un botón "⋯" que abre un Drawer
// lateral bajo demanda, reutilizando las clases .td-* ya existentes en
// globals.css (el mismo Drawer del detalle de tarea, Fase 3). Cero CSS nuevo.
//
// No duplica lógica: LogbookCard/KnowledgeCard se siguen usando tal cual (con
// sus Server Actions de logbook-knowledge-actions.ts) y "Editar proyecto"
// reutiliza updateProject (nueva Server Action en actions.ts).
import { useState } from "react";
import LogbookCard from "./LogbookCard";
import KnowledgeCard from "./KnowledgeCard";
import EditProjectForm from "./EditProjectForm";
import type { LogEntry, KnowledgeItem } from "./logbook-knowledge-actions";
import { IconClose } from "@/components/icons";

export interface ProjectMenuData {
  id: string;
  title: string;
  objective: string;
  status: string;
  priority: string;
  targetDate: string | null;
}

type Panel = "edit" | "logbook" | "knowledge" | null;

export default function ProjectMenu({
  project,
  logbookEntries,
  knowledgeItems
}: {
  project: ProjectMenuData;
  logbookEntries: LogEntry[];
  knowledgeItems: KnowledgeItem[];
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  function openPanel(p: Panel) {
    setOpen(false);
    setPanel(p);
  }

  const panelTitle =
    panel === "edit" ? "Editar proyecto" : panel === "logbook" ? "Bitácora" : "Base de conocimiento";

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={() => setOpen((v) => !v)}
        aria-label="Opciones del proyecto"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ minWidth: 40, padding: "6px 12px", fontWeight: 900, letterSpacing: 2, lineHeight: 1 }}
      >
        ⋯
      </button>

      {open && (
        <>
          {/* backdrop transparente para cerrar al hacer clic fuera */}
          <div className="ex-backdrop" onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 6px)",
              zIndex: "var(--z-popover)",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              boxShadow: "var(--shadow)",
              minWidth: 230,
              padding: 6
            }}
          >
            <MenuItem icon="✏️" label="Editar proyecto" onClick={() => openPanel("edit")} />
            <MenuItem icon="📓" label="Bitácora" onClick={() => openPanel("logbook")} />
            <MenuItem icon="📚" label="Base de conocimiento" onClick={() => openPanel("knowledge")} />
          </div>
        </>
      )}

      {panel && (
        <>
          <div className="td-backdrop" onClick={() => setPanel(null)} />
          <aside className="td-drawer" role="dialog" aria-modal="true" aria-label={panelTitle}>
            <div className="td-drawer-header">
              <b className="td-drawer-title">{panelTitle}</b>
              <button type="button" className="td-drawer-close" onClick={() => setPanel(null)} aria-label="Cerrar">
                <IconClose />
              </button>
            </div>
            <div className="td-drawer-body">
              {panel === "edit" && <EditProjectForm project={project} onSaved={() => setPanel(null)} />}
              {panel === "logbook" && <LogbookCard projectId={project.id} entries={logbookEntries} />}
              {panel === "knowledge" && <KnowledgeCard projectId={project.id} items={knowledgeItems} />}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        border: "none",
        background: "transparent",
        padding: "9px 10px",
        borderRadius: 8,
        textAlign: "left",
        cursor: "pointer",
        color: "var(--text)",
        fontWeight: 600,
        minHeight: "auto"
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}
