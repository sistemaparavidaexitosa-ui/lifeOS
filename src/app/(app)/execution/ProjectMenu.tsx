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
import SequencePanel from "./SequencePanel";
import MenuSurface, { useMenuAnchor } from "@/components/MenuSurface";
import { deleteProject } from "./actions";
import { applyProjectTemplate } from "./template-actions";
import AiPlanPanel from "./AiPlanPanel";
import { applyAiPlan } from "./ai-plan-actions";
import { TemplateSelect, TemplatePreview } from "./ProjectTemplatePicker";
import { moveProject, shareProjectWithGuest, unshareProjectFromGuests } from "@/lib/workspaces/actions";
import type { WorkspaceSummary } from "@/lib/data/workspaces";
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

type Panel = "sequence" | "ai-plan" | "template" | "edit" | "move" | "guests" | "logbook" | "knowledge" | "delete" | null;

const PANEL_TITLE: Record<Exclude<Panel, null>, string> = {
  sequence: "Secuencia sugerida",
  "ai-plan": "Generar plan con IA",
  template: "Aplicar plantilla",
  edit: "Editar proyecto",
  move: "Mover a otro espacio",
  guests: "Acceso de invitados",
  logbook: "Bitácora",
  knowledge: "Base de conocimiento",
  delete: "Eliminar proyecto"
};

export default function ProjectMenu({
  project,
  taskCount,
  sequenceTasks,
  logbookEntries,
  knowledgeItems,
  workspaces,
  currentWorkspaceId,
  guestAccess,
  workspaceIsPersonal
}: {
  project: ProjectMenuData;
  /** Cuántas tareas se van con el proyecto: el aviso tiene que decirlo. */
  taskCount: number;
  /** Tareas que alimentan la secuencia sugerida (antes un botón aparte). */
  sequenceTasks: { id: string; title: string }[];
  logbookEntries: LogEntry[];
  knowledgeItems: KnowledgeItem[];
  /** Espacios donde el usuario puede escribir: destinos válidos para mover. */
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string;
  /** Nivel del share vigente, o null si ningún invitado alcanza el proyecto. */
  guestAccess: string | null;
  /** En el espacio personal no hay invitados: la opción ni se ofrece. */
  workspaceIsPersonal: boolean;
}) {
  const menu = useMenuAnchor();
  const [panel, setPanel] = useState<Panel>(null);
  // Lo necesita el panel de plan con IA para repintar el tablero al aplicar.
  const router = useRouter();

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
            <MenuItem icon="✨" label="Sugerir secuencia" onClick={() => openPanel("sequence")} />
            <MenuItem icon="🤖" label="Generar plan con IA" onClick={() => openPanel("ai-plan")} />
            <MenuItem icon="🧩" label="Aplicar plantilla" onClick={() => openPanel("template")} />
            <MenuItem icon="✏️" label="Editar proyecto" onClick={() => openPanel("edit")} />
            {/* Sustituye a la vieja pantalla "Compartir un proyecto personal":
                desde 0031 la membresía del espacio YA da acceso, así que
                compartir un proyecto es sencillamente moverlo de espacio. */}
            {workspaces.length > 1 && (
              <MenuItem icon="📦" label="Mover a otro espacio" onClick={() => openPanel("move")} />
            )}
            {/* Los demás roles entran por membresía (0031); el Guest es el
                único que necesita esta llave por proyecto. */}
            {!workspaceIsPersonal && (
              <MenuItem
                icon="🔑"
                label={guestAccess ? `Acceso de invitados (${guestAccess})` : "Acceso de invitados"}
                onClick={() => openPanel("guests")}
              />
            )}
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
              {panel === "sequence" && (
                <SequencePanel projectId={project.id} tasks={sequenceTasks} onClose={() => setPanel(null)} />
              )}
              {panel === "ai-plan" && (
                <AiPlanPanel
                  projectId={project.id}
                  taskCount={taskCount}
                  defaultObjective={project.objective}
                  targetDate={project.targetDate}
                  confirmLabel="Añadir al proyecto"
                  onConfirm={async (draft, selection) => {
                    const result = await applyAiPlan(project.id, draft, selection);
                    if (result.ok) {
                      // La MISMA pareja que ApplyTemplatePanel y MoveProjectPanel:
                      // el `replace` fuerza una navegación de verdad y el `refresh`
                      // trae el árbol nuevo saltándose la caché del router. Con
                      // `refresh` a secas el tablero se queda igual.
                      router.replace(`/execution?project=${project.id}`);
                      router.refresh();
                    }
                    return result;
                  }}
                  onDone={() => setPanel(null)}
                />
              )}
              {panel === "template" && (
                <ApplyTemplatePanel projectId={project.id} taskCount={taskCount} onDone={() => setPanel(null)} />
              )}
              {panel === "edit" && <EditProjectForm project={project} onSaved={() => setPanel(null)} />}
              {panel === "move" && (
                <MoveProjectPanel
                  project={project}
                  workspaces={workspaces}
                  currentWorkspaceId={currentWorkspaceId}
                  onDone={() => setPanel(null)}
                />
              )}
              {panel === "guests" && (
                <GuestAccessPanel project={project} current={guestAccess} onDone={() => setPanel(null)} />
              )}
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
 * Mover el proyecto a otro espacio de trabajo.
 *
 * Cambiar de espacio cambia QUIÉN VE el proyecto: en un espacio de equipo lo
 * alcanzan todos sus miembros (0031). Por eso el panel lo dice con todas sus
 * letras antes de mover, en vez de presentarlo como un cambio de etiqueta.
 *
 * Los destinos ya vienen filtrados por rol desde el servidor, pero quien
 * manda es `projects_update_edit`: su WITH CHECK se evalúa sobre la fila NUEVA
 * y la base rechaza mover un proyecto a un espacio donde no puedas escribir.
 */
function MoveProjectPanel({
  project,
  workspaces,
  currentWorkspaceId,
  onDone
}: {
  project: ProjectMenuData;
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [target, setTarget] = useState(currentWorkspaceId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const destino = workspaces.find((w) => w.id === target);
  const cambia = target !== currentWorkspaceId;

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs flex flex-col gap-1" style={{ color: "var(--muted)" }}>
        Espacio de destino
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Espacio de destino">
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.isPersonal ? " (personal)" : ""}
              {w.id === currentWorkspaceId ? " · actual" : ""}
            </option>
          ))}
        </select>
      </label>

      {destino && cambia && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {destino.isPersonal ? (
            <>
              <b>{project.title}</b> dejará de ser visible para el equipo: en tu espacio personal solo lo ves tú.
            </>
          ) : (
            <>
              Todos los miembros de <b>{destino.name}</b> podrán ver <b>{project.title}</b>, y quienes tengan rol
              Member o superior podrán editarlo.
            </>
          )}
        </p>
      )}

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
        <button type="button" className="btn-ghost btn-sm w-full sm:w-auto" onClick={onDone} disabled={pending}>
          Cancelar
        </button>
        <span className="hidden sm:block grow" />
        <button
          type="button"
          className="btn-primary btn-sm w-full sm:w-auto"
          disabled={!cambia || pending}
          onClick={() =>
            startTransition(async () => {
              const result = await moveProject(project.id, target);
              if (!result.ok) {
                setError(result.reason ?? "No se pudo mover el proyecto.");
                return;
              }
              onDone();
              router.replace(`/execution?project=${project.id}`);
              router.refresh();
            })
          }
        >
          {pending ? "Moviendo…" : "Mover proyecto"}
        </button>
      </div>
    </div>
  );
}

/**
 * Acceso de los invitados (rol Guest) a ESTE proyecto.
 *
 * Es lo único que quedó de `project_shares` tras la migración 0031. Owner,
 * Admin, Member y Viewer ven los proyectos de su espacio por membresía; el
 * Guest no ve ninguno salvo los que se le abran aquí, y solo escribe si el
 * nivel es `edit`.
 */
function GuestAccessPanel({
  project,
  current,
  onDone
}: {
  project: ProjectMenuData;
  current: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [level, setLevel] = useState(current ?? "view");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(action: () => Promise<{ ok: boolean; reason?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.reason ?? "No se pudo guardar el acceso.");
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {current ? (
          <>
            Los invitados (rol <b>Guest</b>) de este espacio alcanzan <b>{project.title}</b> con nivel{" "}
            <b>{current}</b>.
          </>
        ) : (
          <>
            Ningún invitado alcanza <b>{project.title}</b>. Los demás roles del espacio ya lo ven por ser miembros;
            esto es solo para los Guest.
          </>
        )}
      </p>

      <label className="text-xs flex flex-col gap-1" style={{ color: "var(--muted)" }}>
        Nivel de acceso
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Nivel de acceso de invitados">
          <option value="view">view — solo leer</option>
          <option value="comment">comment — leer y comentar</option>
          <option value="edit">edit — leer y editar</option>
        </select>
      </label>

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
        {current && (
          <button
            type="button"
            className="btn-ghost btn-sm w-full sm:w-auto"
            disabled={pending}
            onClick={() => apply(() => unshareProjectFromGuests(project.id))}
          >
            Quitar acceso
          </button>
        )}
        <span className="hidden sm:block grow" />
        <button
          type="button"
          className="btn-primary btn-sm w-full sm:w-auto"
          disabled={pending}
          onClick={() =>
            apply(() => {
              const fd = new FormData();
              fd.set("projectId", project.id);
              fd.set("accessLevel", level);
              return shareProjectWithGuest(fd);
            })
          }
        >
          {pending ? "Guardando…" : current ? "Cambiar nivel" : "Dar acceso"}
        </button>
      </div>
    </div>
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

/**
 * Aplicar una plantilla a un proyecto que YA existe.
 *
 * AÑADE al final, nunca reemplaza: los grupos nuevos van después de los que hay
 * y no se borra nada. Por eso aplicar dos veces DUPLICA, y por eso este panel
 * avisa cuando el proyecto ya tiene tareas — impedirlo sería equivocarse en la
 * otra dirección, porque repetir una fase es un uso legítimo en un proyecto
 * largo. El aviso informa; la decisión sigue siendo del usuario.
 */
function ApplyTemplatePanel({
  projectId,
  taskCount,
  onDone
}: {
  projectId: string;
  taskCount: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ groups: number; tasks: number } | null>(null);

  // El panel NO se cierra solo al terminar, y no es una preferencia de estilo.
  //
  // Cerrarlo desmonta este componente, que es el dueño del `useTransition` en
  // el que corre la acción — y una transición cuyo componente desaparece se
  // abandona, así que el árbol nuevo que el servidor ya había devuelto nunca se
  // aplicaba. El tablero se quedaba igual y había que salir del proyecto y
  // volver a entrar. (MoveProjectPanel no lo sufre porque su `router.replace`
  // es una navegación de verdad, que no depende de esta transición.)
  //
  // De paso resuelve algo que faltaba: al terminar se dice QUÉ se creó. Antes
  // el panel se desvanecía y no había forma de saber si había pasado algo.
  if (hecho) {
    return (
      <div className="flex flex-col gap-3">
        <div
          className="text-sm"
          style={{
            background: "color-mix(in srgb, var(--c-green) 12%, var(--surface))",
            borderLeft: "3px solid var(--c-green)",
            borderRadius: "0 10px 10px 0",
            padding: "10px 12px"
          }}
        >
          Se añadieron <b>{hecho.groups}</b> grupo{hecho.groups === 1 ? "" : "s"} y <b>{hecho.tasks}</b> tarea
          {hecho.tasks === 1 ? "" : "s"} al final del tablero.
        </div>
        <button className="btn-primary btn-sm" onClick={onDone}>
          Ver el tablero
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Los grupos de la plantilla se añaden <b>al final</b>. Nada de lo que ya hay se borra ni se mueve.
      </p>

      {taskCount > 0 && (
        <div
          className="text-xs"
          style={{
            background: "color-mix(in srgb, var(--c-orange) 12%, var(--surface))",
            borderLeft: "3px solid var(--c-orange)",
            borderRadius: "0 10px 10px 0",
            padding: "8px 10px"
          }}
        >
          Este proyecto ya tiene {taskCount} tarea{taskCount === 1 ? "" : "s"}. La plantilla no las toca, pero si ya la
          aplicaste antes vas a acabar con los grupos repetidos.
        </div>
      )}

      <label className="text-xs font-bold">
        Plantilla
        <TemplateSelect value={templateId} onChange={setTemplateId} />
      </label>
      <TemplatePreview templateId={templateId} />

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <button
        className="btn-primary btn-sm"
        disabled={pending || !templateId}
        onClick={() =>
          startTransition(async () => {
            const result = await applyProjectTemplate(projectId, templateId);
            if (!result.ok) {
              setError(result.reason ?? "No se pudo aplicar la plantilla.");
              return;
            }
            // La MISMA pareja que usa MoveProjectPanel unas líneas más arriba,
            // que es la que en esta pantalla está demostrado que repinta: el
            // `replace` a la misma URL fuerza una navegación de verdad, y el
            // `refresh` trae el árbol nuevo saltándose la caché del router.
            // Con `refresh` a secas el tablero se quedaba igual y había que
            // salir del proyecto y volver a entrar.
            router.replace(`/execution?project=${projectId}`);
            router.refresh();
            setHecho(result.created ?? { groups: 0, tasks: 0 });
          })
        }
      >
        {pending ? "Aplicando…" : "Aplicar al proyecto"}
      </button>
    </div>
  );
}
