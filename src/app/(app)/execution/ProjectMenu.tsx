"use client";
// Menú "⋯" del proyecto: editar, bitácora, base de conocimiento y eliminar.
//
// Sus paneles viven en el Drawer lateral (.td-*), el mismo del detalle de
// tarea: lateral en escritorio, hoja desde abajo en móvil.
//
// FIX (móvil): este era el ÚNICO popover del módulo que seguía con
// posicionamiento a mano — `position: absolute; right: 0; top: calc(100% +
// 6px)` y su z-index escrito en línea. Cuando se unificaron los menús en
// MenuSurface se quedó fuera, y por eso era el que se encimaba: `absolute` lo
// recorta cualquier ancestro con overflow y no sabe voltearse cuando nace
// pegado al borde inferior de la pantalla. Ahora usa MenuSurface como los
// demás, así que hereda el volteo arriba/abajo y el recorte contra la ventana.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import LogbookCard from "./LogbookCard";
import KnowledgeCard from "./KnowledgeCard";
import EditProjectForm from "./EditProjectForm";
import MenuSurface, { useMenuAnchor } from "./MenuSurface";
import { deleteProject } from "./actions";
import type { LogEntry, KnowledgeItem } from "./logbook-knowledge-actions";
import { IconClose, IconTrash } from "@/components/icons";

export interface ProjectMenuData {
  id: string;
  title: string;
  objective: string;
  status: string;
  priority: string;
  targetDate: string | null;
}

type Panel = "edit" | "logbook" | "knowledge" | "delete" | null;

const PANEL_TITLE: Record<Exclude<Panel, null>, string> = {
  edit: "Editar proyecto",
  logbook: "Bitácora",
  knowledge: "Base de conocimiento",
  delete: "Eliminar proyecto"
};

export default function ProjectMenu({
  project,
  taskCount,
  logbookEntries,
  knowledgeItems
}: {
  project: ProjectMenuData;
  /** Cuántas tareas se van con el proyecto: el aviso tiene que decirlo. */
  taskCount: number;
  logbookEntries: LogEntry[];
  knowledgeItems: KnowledgeItem[];
}) {
  const menu = useMenuAnchor();
  const [panel, setPanel] = useState<Panel>(null);

  function openPanel(p: Panel) {
    menu.close();
    setPanel(p);
  }

  return (
    <>
      <button
        type="button"
        className="btn-ghost btn-sm ex-header-more"
        onClick={menu.toggle}
        aria-label="Opciones del proyecto"
        aria-haspopup="menu"
        aria-expanded={menu.open}
      >
        ⋯
      </button>

      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} align="end" width={236} label="Opciones del proyecto">
          <div className="ex-menu-list">
            <MenuItem icon="✏️" label="Editar proyecto" onClick={() => openPanel("edit")} />
            <MenuItem icon="📓" label="Bitácora" onClick={() => openPanel("logbook")} />
            <MenuItem icon="📚" label="Base de conocimiento" onClick={() => openPanel("knowledge")} />
            <MenuItem icon="🗑️" label="Eliminar proyecto" danger onClick={() => openPanel("delete")} />
          </div>
        </MenuSurface>
      )}

      {panel && (
        <>
          <div className="td-backdrop" onClick={() => setPanel(null)} />
          <aside className="td-drawer" role="dialog" aria-modal="true" aria-label={PANEL_TITLE[panel]}>
            <div className="td-drawer-header">
              <b className="td-drawer-title">{PANEL_TITLE[panel]}</b>
              <button type="button" className="td-drawer-close" onClick={() => setPanel(null)} aria-label="Cerrar">
                <IconClose />
              </button>
            </div>
            <div className="td-drawer-body">
              {panel === "edit" && <EditProjectForm project={project} onSaved={() => setPanel(null)} />}
              {panel === "logbook" && <LogbookCard projectId={project.id} entries={logbookEntries} />}
              {panel === "knowledge" && <KnowledgeCard projectId={project.id} items={knowledgeItems} />}
              {panel === "delete" && (
                <DeleteProjectPanel project={project} taskCount={taskCount} onCancel={() => setPanel(null)} />
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

/**
 * Borrar un proyecto se lleva por delante todas sus tareas, así que no basta
 * un window.confirm: hay que teclear el título. Es la misma barrera que usa
 * GitHub para borrar un repositorio, y por la misma razón — el clic de más se
 * da por reflejo, teclear un nombre no.
 */
function DeleteProjectPanel({
  project,
  taskCount,
  onCancel
}: {
  project: ProjectMenuData;
  taskCount: number;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim() === project.title.trim();

  return (
    <div className="flex flex-col gap-3">
      <div className="ex-danger-note">
        <b>Esto no se puede deshacer.</b> Se eliminarán el proyecto{" "}
        <b style={{ overflowWrap: "anywhere" }}>{project.title}</b>
        {taskCount > 0 ? (
          <>
            {" "}
            y sus <b>{taskCount}</b> tarea{taskCount === 1 ? "" : "s"}, con sus grupos, responsables, archivos y
            comentarios.
          </>
        ) : (
          <> y sus grupos.</>
        )}
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Tu bitácora y tu base de conocimiento NO se borran: son tuyas, no del proyecto, y siguen disponibles.
      </p>

      <label className="text-xs flex flex-col gap-1" style={{ color: "var(--muted)" }}>
        Escribe <b style={{ color: "var(--text)", overflowWrap: "anywhere" }}>{project.title}</b> para confirmar
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Título del proyecto"
          aria-label="Confirmar título del proyecto"
          autoComplete="off"
        />
      </label>

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
        <button type="button" className="btn-ghost btn-sm w-full sm:w-auto" onClick={onCancel} disabled={pending}>
          Cancelar
        </button>
        <span className="hidden sm:block grow" />
        <button
          type="button"
          className="btn-danger btn-sm w-full sm:w-auto"
          disabled={!matches || pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await deleteProject(project.id);
                // El tablero que se estaba viendo ya no existe: volver a la
                // cartera es lo único coherente.
                router.push("/execution");
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "No se pudo eliminar el proyecto");
              }
            })
          }
        >
          <IconTrash width={15} height={15} />
          {pending ? "Eliminando…" : "Eliminar proyecto"}
        </button>
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`ex-menu-item${danger ? " danger" : ""}`}>
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}
