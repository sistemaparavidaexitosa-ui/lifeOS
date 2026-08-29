"use client";
// Selector de espacio de trabajo, en la cabecera de la cartera.
//
// POR QUÉ ESTÁ AQUÍ Y NO EN EL MENÚ LATERAL
// Los espacios dejaron de ser un módulo con pantalla propia ("Equipos y
// Colaboración") para ser el CONTENEDOR de los proyectos: desde la migración
// 0030 no existe un proyecto sin espacio. Elegir espacio es, por tanto, la
// misma decisión que "qué proyectos estoy viendo" — pertenece a la barra de la
// cartera, no a una sección aparte a la que había que ir y volver.
//
// El espacio activo viaja en la URL (?ws=…) y no en estado de cliente: así el
// enlace es compartible, el botón de atrás funciona, y el Server Component
// puede filtrar los proyectos en la consulta en vez de traerlos todos y
// esconder los que no tocan.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MenuSurface, { useMenuAnchor } from "./MenuSurface";
import { createWorkspace } from "./workspace-actions";
import type { WorkspaceSummary } from "@/lib/data/workspaces";

export default function WorkspaceSwitcher({
  workspaces,
  activeId
}: {
  workspaces: WorkspaceSummary[];
  activeId: string;
}) {
  const router = useRouter();
  const menu = useMenuAnchor();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];
  if (!active) return null;

  function select(id: string) {
    menu.close();
    router.push(`/execution?ws=${id}`);
  }

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await createWorkspace(trimmed);
      if (!result.ok || !result.id) {
        setError(result.reason ?? "No se pudo crear el espacio.");
        return;
      }
      setName("");
      setCreating(false);
      setError(null);
      menu.close();
      // Directo al espacio nuevo: crearlo y quedarse en el anterior obligaba a
      // volver a abrir el selector para entrar.
      router.push(`/execution?ws=${result.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="ex-ws-trigger"
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label={`Espacio de trabajo: ${active.name}. Cambiar`}
      >
        <WorkspaceBadge workspace={active} />
        <span className="ex-ws-name">{active.name}</span>
        <span className="ex-ws-caret" aria-hidden>
          ▾
        </span>
      </button>

      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} align="start" width={264} label="Espacios de trabajo">
          <div className="ex-menu-list">
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                role="menuitem"
                className={`ex-menu-item ex-ws-option${w.id === active.id ? " active" : ""}`}
                onClick={() => select(w.id)}
              >
                <WorkspaceBadge workspace={w} />
                <span className="ex-ws-option-text">
                  <span className="ex-ws-option-name">{w.name}</span>
                  <span className="ex-ws-option-role">{w.isPersonal ? "Solo tú" : w.role}</span>
                </span>
                {w.id === active.id && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>

          <div className="ex-ws-create">
            {creating ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      create();
                    }
                    if (e.key === "Escape") setCreating(false);
                  }}
                  placeholder="Nombre del espacio"
                  aria-label="Nombre del nuevo espacio"
                />
                {error && (
                  <span className="text-xs" style={{ color: "var(--danger)" }}>
                    {error}
                  </span>
                )}
                <div className="flex gap-2">
                  <button type="button" className="btn-primary btn-sm" onClick={create} disabled={pending}>
                    {pending ? "Creando…" : "Crear espacio"}
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setCreating(false)} disabled={pending}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="ex-menu-item" onClick={() => setCreating(true)}>
                <span aria-hidden>＋</span>
                Nuevo espacio
              </button>
            )}
          </div>
        </MenuSurface>
      )}
    </>
  );
}

function WorkspaceBadge({ workspace }: { workspace: WorkspaceSummary }) {
  return (
    <span
      className="ex-ws-badge"
      style={{ background: workspace.isPersonal ? "var(--muted)" : workspace.color }}
      aria-hidden
    >
      {workspace.name.slice(0, 2).toUpperCase()}
    </span>
  );
}
