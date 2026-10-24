"use client";

// La portada de Execution: los proyectos de UN espacio.
//
// Lo primero que se ve es lo que pide atención, no el inventario:
//   1. Una línea de pulso del espacio (para hoy · vencidas · en curso).
//   2. Los proyectos ACTIVOS como tarjetas: anillo de avance, título y una
//      sola línea que dice lo más urgente de cada uno («2 vencidas», «3 para
//      hoy», «próxima: vie»).
//   3. Borradores y pausados debajo, más tenues.
//   4. Lo cerrado (completado, cancelado, archivado), plegado.
//
// Cambiar estado o meta, o borrar, ya no son controles en cada fila: viven en
// el «⋯» de la tarjeta, en una hoja. En el iPhone una fila con tres botones
// pequeños era tres maneras de tocar sin querer.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconSearch, IconClose } from "@/components/icons";
import { PROJECT_STATUS_META, PROJECT_STATUS_ORDER } from "./status-meta";
import { deleteProject, patchProject, type ProjectPatch } from "./actions";
import type { Priority, ProjectStatus } from "@/lib/domain/types.ts";
import Sheet from "./ui/Sheet";
import MantenerParaBorrar from "./ui/MantenerParaBorrar";
import Avisos, { aviso } from "./ui/avisos";
import { Anillo, Chevron } from "./ui/iconos";
import { fechaRelativa } from "./ui/fechas";

export interface PortfolioProject {
  id: string;
  title: string;
  status: ProjectStatus;
  priority: Priority;
  progress: number;
  taskCount: number;
  openCount: number;
  overdueCount: number;
  /** Tareas abiertas que vencen hoy. */
  dueTodayCount: number;
  /** Tareas en curso ahora mismo. */
  inProgressCount: number;
  /** La fecha más cercana entre las tareas abiertas que aún no vencen. */
  nextDue: string | null;
  targetDate: string | null;
  targetDateLabel: string;
}

const ACTIVOS: ProjectStatus[] = ["Active"];
const EN_ESPERA: ProjectStatus[] = ["Draft", "OnHold"];

export default function PortfolioBoard({
  projects,
  view,
  today,
  workspaceName = "",
  workspaceNav,
  children
}: {
  projects: PortfolioProject[];
  /** Vista del tablero a la que se entra al abrir un proyecto. */
  view: string;
  today: string;
  /** Espacio de trabajo que se está viendo: la cartera es siempre la de UN espacio. */
  workspaceName?: string;
  /** Selector de espacio + panel de Equipo. */
  workspaceNav?: React.ReactNode;
  /** Botón «Nuevo proyecto» (Client Component, inyectado desde page.tsx). */
  children?: React.ReactNode;
}) {
  // Copia local para aplicar los cambios al instante; se resincroniza cuando
  // el servidor revalida.
  const [rows, setRows] = useState(projects);
  const [query, setQuery] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [cerradosAbiertos, setCerradosAbiertos] = useState(false);
  const [acciones, setAcciones] = useState<PortfolioProject | null>(null);
  const [entrando, setEntrando] = useState(true);

  useEffect(() => setRows(projects), [projects]);
  useEffect(() => {
    const t = window.setTimeout(() => setEntrando(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  const visibles = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? rows.filter((p) => p.title.toLowerCase().includes(text)) : rows;
  }, [rows, query]);

  const activos = visibles.filter((p) => ACTIVOS.includes(p.status));
  const enEspera = visibles.filter((p) => EN_ESPERA.includes(p.status));
  const cerrados = visibles.filter((p) => !ACTIVOS.includes(p.status) && !EN_ESPERA.includes(p.status));

  const vivos = rows.filter((p) => !["Completed", "Cancelled", "Archived"].includes(p.status));
  const paraHoy = vivos.reduce((s, p) => s + p.dueTodayCount, 0);
  const vencidas = vivos.reduce((s, p) => s + p.overdueCount, 0);
  const enCurso = vivos.reduce((s, p) => s + p.inProgressCount, 0);

  function aplicar(id: string, patch: ProjectPatch) {
    const previo = rows;
    setRows((prev) =>
      prev.map((p) =>
        p.id !== id
          ? p
          : {
              ...p,
              status: patch.status ?? p.status,
              priority: patch.priority ?? p.priority,
              targetDate: patch.targetDate !== undefined ? patch.targetDate : p.targetDate,
              targetDateLabel: patch.targetDate !== undefined ? (patch.targetDate ? fechaRelativa(patch.targetDate, today) : "") : p.targetDateLabel
            }
      )
    );
    patchProject(id, patch).catch((e) => {
      // Revertir es obligatorio: si no, la tarjeta enseña algo que la base no
      // tiene y el siguiente refresco lo «deshace» sin explicación.
      setRows(previo);
      aviso({ tono: "error", mensaje: "No se guardó el cambio", detalle: e instanceof Error ? e.message : undefined });
    });
  }

  function borrar(p: PortfolioProject) {
    const previo = rows;
    setRows((prev) => prev.filter((x) => x.id !== p.id));
    setAcciones(null);
    deleteProject(p.id)
      .then(() => aviso({ mensaje: "Proyecto borrado", detalle: p.title }))
      .catch((e) => {
        setRows(previo);
        aviso({ tono: "error", mensaje: "No se pudo borrar el proyecto", detalle: e instanceof Error ? e.message : undefined });
      });
  }

  let indice = 0;
  const tarjeta = (p: PortfolioProject, tenue = false) => (
    <Tarjeta key={p.id} p={p} view={view} today={today} tenue={tenue} indice={indice++} onAcciones={() => setAcciones(p)} />
  );

  return (
    <div className="xr-portada" data-entrando={entrando || undefined}>
      <header className="xr-portada-cabeza">
        <div>
          <h1 className="xr-portada-titulo">Proyectos</h1>
          {rows.length > 0 && (
            <p className="xr-pulso">
              <Pulso n={paraHoy} uno="para hoy" muchos="para hoy" />
              <Pulso n={vencidas} uno="vencida" muchos="vencidas" tono="vencida" />
              <Pulso n={enCurso} uno="en curso" muchos="en curso" />
              {!paraHoy && !vencidas && !enCurso && <span>Todo al día</span>}
            </p>
          )}
        </div>
        {children}
      </header>

      <div className="xr-portada-barra">
        {buscando ? (
          <div className="xr-buscar">
            <IconSearch width={16} height={16} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proyecto"
              aria-label="Buscar proyecto"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  setBuscando(false);
                }
              }}
            />
            <button
              type="button"
              className="xr-icono-btn"
              aria-label="Cerrar búsqueda"
              onClick={() => {
                setQuery("");
                setBuscando(false);
              }}
            >
              <IconClose width={16} height={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="xr-espacio">{workspaceNav}</div>
            {rows.length > 3 && (
              <button type="button" className="xr-icono-btn" onClick={() => setBuscando(true)} aria-label="Buscar proyecto">
                <IconSearch width={18} height={18} />
              </button>
            )}
          </>
        )}
      </div>

      {!rows.length && (
        <div className="xr-vacio">
          <p className="xr-vacio-titulo">{workspaceName ? `«${workspaceName}» todavía no tiene proyectos` : "Todavía no hay proyectos"}</p>
          <p>Un proyecto es cualquier cosa con más de un paso. Crea el primero y escríbele las tareas.</p>
        </div>
      )}

      {rows.length > 0 && !visibles.length && <p className="xr-nota">Ningún proyecto coincide con «{query}».</p>}

      {activos.length > 0 && (
        <section className="xr-seccion-portada">
          <h2 className="xr-etiqueta">Activos</h2>
          <div className="xr-tarjetas">{activos.map((p) => tarjeta(p))}</div>
        </section>
      )}

      {enEspera.length > 0 && (
        <section className="xr-seccion-portada">
          <h2 className="xr-etiqueta">Borradores y en pausa</h2>
          <div className="xr-tarjetas">{enEspera.map((p) => tarjeta(p, true))}</div>
        </section>
      )}

      {cerrados.length > 0 && (
        <section className="xr-seccion-portada">
          <button type="button" className="xr-grupo-cabeza" onClick={() => setCerradosAbiertos((v) => !v)} aria-expanded={cerradosAbiertos}>
            <Chevron abierto={cerradosAbiertos} />
            <span className="xr-grupo-nombre">Cerrados</span>
            <span className="xr-grupo-cuenta">{cerrados.length}</span>
          </button>
          {cerradosAbiertos && <div className="xr-tarjetas">{cerrados.map((p) => tarjeta(p, true))}</div>}
        </section>
      )}

      <AccionesDeProyecto
        p={acciones}
        today={today}
        onClose={() => setAcciones(null)}
        onPatch={(patch) => {
          if (!acciones) return;
          aplicar(acciones.id, patch);
          setAcciones((a) => (a ? { ...a, ...(patch.status ? { status: patch.status } : {}), ...(patch.targetDate !== undefined ? { targetDate: patch.targetDate } : {}) } : a));
        }}
        onBorrar={() => acciones && borrar(acciones)}
      />

      <Avisos />
    </div>
  );
}

function Pulso({ n, uno, muchos, tono }: { n: number; uno: string; muchos: string; tono?: "vencida" }) {
  if (!n) return null;
  return (
    <span data-tono={tono}>
      <b>{n}</b> {n === 1 ? uno : muchos}
    </span>
  );
}

/** Lo más urgente de un proyecto, en una línea. */
function lineaDePulso(p: PortfolioProject, today: string): { texto: string; tono?: "vencida" | "hoy" } {
  if (p.overdueCount) return { texto: `${p.overdueCount} ${p.overdueCount === 1 ? "vencida" : "vencidas"}`, tono: "vencida" };
  if (p.dueTodayCount) return { texto: `${p.dueTodayCount} para hoy`, tono: "hoy" };
  if (p.nextDue) return { texto: `Próxima: ${fechaRelativa(p.nextDue, today)}` };
  if (!p.taskCount) return { texto: "Sin tareas todavía" };
  if (!p.openCount) return { texto: "Todo hecho" };
  return { texto: `${p.openCount} ${p.openCount === 1 ? "abierta" : "abiertas"}, sin fechas` };
}

function Tarjeta({
  p,
  view,
  today,
  tenue,
  indice,
  onAcciones
}: {
  p: PortfolioProject;
  view: string;
  today: string;
  tenue: boolean;
  indice: number;
  onAcciones: () => void;
}) {
  const pulso = lineaDePulso(p, today);
  const estado = PROJECT_STATUS_META[p.status];
  return (
    <article className="xr-tarjeta" data-tenue={tenue || undefined} style={{ "--i": Math.min(indice, 10) } as React.CSSProperties}>
      <Link href={`/execution?project=${p.id}${view !== "lista" ? `&view=${view}` : ""}`} className="xr-tarjeta-enlace">
        <Anillo pct={p.progress} size={36} grosor={3} />
        <span className="xr-tarjeta-texto">
          <span className="xr-tarjeta-titulo">{p.title}</span>
          <span className="xr-tarjeta-pulso">
            <span data-tono={pulso.tono}>{pulso.texto}</span>
            {p.status !== "Active" && (
              <span className="xr-tarjeta-estado">
                <span className="xr-punto" style={{ background: estado.color }} />
                {estado.label}
              </span>
            )}
            {p.targetDate && <span>Meta {fechaRelativa(p.targetDate, today)}</span>}
          </span>
        </span>
        <span className="xr-tarjeta-cuenta">
          {p.taskCount - p.openCount}/{p.taskCount}
        </span>
      </Link>
      <button type="button" className="xr-icono-btn xr-tarjeta-mas" onClick={onAcciones} aria-label={`Opciones de ${p.title}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
    </article>
  );
}

function AccionesDeProyecto({
  p,
  today,
  onClose,
  onPatch,
  onBorrar
}: {
  p: PortfolioProject | null;
  today: string;
  onClose: () => void;
  onPatch: (patch: ProjectPatch) => void;
  onBorrar: () => void;
}) {
  // Se conserva el último proyecto mientras la hoja sale.
  const [mostrado, setMostrado] = useState(p);
  if (p && p !== mostrado) setMostrado(p);
  const q = p ?? mostrado;

  return (
    <Sheet open={Boolean(p)} onClose={onClose} title={q?.title ?? "Proyecto"} size="sm">
      {q && (
        <div className="xr-detalle">
          <section className="xr-seccion">
            <h3 className="xr-etiqueta">Estado</h3>
            <div className="xr-opciones" role="radiogroup" aria-label="Estado del proyecto">
              {PROJECT_STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={q.status === s}
                  className="xr-opcion"
                  onClick={() => q.status !== s && onPatch({ status: s })}
                >
                  <span className="xr-punto" style={{ background: PROJECT_STATUS_META[s].color }} />
                  {PROJECT_STATUS_META[s].label}
                  {q.status === s && (
                    <svg className="xr-opcion-marca" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="xr-seccion">
            <h3 className="xr-etiqueta">Fecha meta</h3>
            <div className="xr-fecha-campo">
              <label className="xr-prop-valor">
                {q.targetDate ? fechaRelativa(q.targetDate, today) : "Sin meta"}
                <input
                  type="date"
                  value={q.targetDate ?? ""}
                  onChange={(e) => onPatch({ targetDate: e.target.value || null })}
                  aria-label="Elegir fecha meta"
                />
              </label>
              {q.targetDate && (
                <button type="button" className="xr-ficha-btn" onClick={() => onPatch({ targetDate: null })}>
                  Quitar
                </button>
              )}
            </div>
          </section>

          <section className="xr-seccion">
            <MantenerParaBorrar etiqueta={q.taskCount ? `borrar con sus ${q.taskCount} tareas` : "borrar"} onConfirm={onBorrar} />
          </section>
        </div>
      )}
    </Sheet>
  );
}
