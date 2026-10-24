"use client";

// LA LISTA: la vista por defecto de un proyecto, pensada para el iPhone.
//
// Una fila por tarea raíz, agrupadas por ESTADO —lo que importa al revisar es
// qué está en curso y qué sigue—. Las subtareas no ensucian la lista: la fila
// dice «2/5» y se planean dentro del detalle.
//
// Marcar no pregunta nada:
//   - tocar el círculo avanza un paso (Sin empezar → Trabajando → Hecho);
//   - deslizar la fila a la derecha hace lo mismo con el pulgar;
//   - mantener el círculo (o clic derecho) abre todos los estados posibles.
// Cada cambio deja un aviso con «Deshacer» y la fila se queda en su sitio
// hasta que se guarda (ver `retenidas` en board-types.ts).
//
// Muta el MISMO estado que las demás vistas (`BoardApi`).

import { useEffect, useMemo, useRef, useState } from "react";
import MenuSurface, { useMenuAnchor } from "@/components/MenuSurface";
import { Avatar } from "@/components/ui";
import { IconComment } from "@/components/icons";
import { fcorta } from "@/lib/format";
import { siguientePaso } from "@/lib/domain/execution/avance.ts";
import type { Priority, TaskStatus } from "@/lib/domain/types.ts";
import { STATUS_META, TASK_TRANSITIONS } from "./status-meta";
import type { BoardApi, BoardTask } from "./board-types";
import CapturaRapida from "./ui/CapturaRapida";
import { Chevron, IconoEstado, IconoPrioridad } from "./ui/iconos";

const ORDEN: TaskStatus[] = ["InProgress", "Pending", "Blocked", "Rescheduled", "Completed", "Cancelled"];
const PLEGADOS_AL_INICIO = new Set<TaskStatus>(["Completed", "Cancelled"]);
const PESO_PRIORIDAD: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export default function LinearList({ api, tasks }: { api: BoardApi; tasks: BoardTask[] }) {
  const [plegados, setPlegados] = useState<Set<TaskStatus>>(() => new Set(PLEGADOS_AL_INICIO));
  // La cascada de entrada, solo la primera vez: filtrar o marcar no vuelve a
  // animar la lista entera.
  const [entrando, setEntrando] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setEntrando(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  const visibles = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  const titulos = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);

  // Subtareas por padre, para el «2/5» de la fila.
  const hijas = useMemo(() => {
    const m = new Map<string, { hechas: number; total: number }>();
    for (const t of tasks) {
      if (!t.parentTaskId || t.status === "Cancelled") continue;
      const c = m.get(t.parentTaskId) ?? { hechas: 0, total: 0 };
      c.total += 1;
      if (t.status === "Completed") c.hechas += 1;
      m.set(t.parentTaskId, c);
    }
    return m;
  }, [tasks]);

  const grupos = useMemo(() => {
    // Raíces, y subtareas cuyo padre quedó fuera por un filtro (si no, una
    // subtarea que vence hoy desaparecería al filtrar por «Hoy»).
    const filas = tasks.filter((t) => !t.parentTaskId || !visibles.has(t.parentTaskId));
    return ORDEN.map((estado) => ({
      estado,
      tareas: filas
        .filter((t) => (api.retenidas.get(t.id) ?? t.status) === estado)
        .sort(
          (a, b) =>
            Number(b.urgent) - Number(a.urgent) ||
            PESO_PRIORIDAD[a.priority] - PESO_PRIORIDAD[b.priority] ||
            (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
            a.position - b.position
        )
    })).filter((g) => g.tareas.length > 0);
  }, [tasks, visibles, api.retenidas]);

  function alternar(estado: TaskStatus) {
    setPlegados((prev) => {
      const s = new Set(prev);
      if (s.has(estado)) s.delete(estado);
      else s.add(estado);
      return s;
    });
  }

  let indice = 0;

  return (
    <div className="xr-lista" data-entrando={entrando || undefined}>
      <CapturaRapida
        projectId={api.projectId}
        groupId={api.groups[0]?.id ?? null}
        today={api.today}
        placeholder="Nueva tarea · «mañana alta»"
        onCreated={api.taskCreated}
      />

      {!grupos.length && (
        <div className="xr-vacio">
          <p className="xr-vacio-titulo">Nada por aquí</p>
          <p>Escribe la primera tarea arriba. Puedes terminarla con «mañana», «viernes» o «alta».</p>
        </div>
      )}

      {grupos.map(({ estado, tareas }) => {
        const plegado = plegados.has(estado);
        return (
          <section key={estado} className="xr-grupo">
            <button type="button" className="xr-grupo-cabeza" onClick={() => alternar(estado)} aria-expanded={!plegado}>
              <Chevron abierto={!plegado} />
              <IconoEstado estado={estado} size={15} />
              <span className="xr-grupo-nombre">{STATUS_META[estado].label}</span>
              <span className="xr-grupo-cuenta">{tareas.length}</span>
            </button>
            {!plegado && (
              <ul className="xr-filas">
                {tareas.map((t) => (
                  <Fila
                    key={t.id}
                    t={t}
                    api={api}
                    indice={indice++}
                    padre={t.parentTaskId ? (titulos.get(t.parentTaskId) ?? null) : null}
                    subtareas={hijas.get(t.id) ?? null}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Fila({
  t,
  api,
  indice,
  padre,
  subtareas
}: {
  t: BoardTask;
  api: BoardApi;
  indice: number;
  padre: string | null;
  subtareas: { hechas: number; total: number } | null;
}) {
  const cerrada = t.status === "Completed" || t.status === "Cancelled";
  const vencida = Boolean(t.due && t.due < api.today && !cerrada);
  const hoy = t.due === api.today;
  const responsables = api.assigneesByTask[t.id] ?? [];
  const comentarios = api.commentCountByTask[t.id] ?? 0;
  const retenida = api.retenidas.has(t.id);
  const siguiente = siguientePaso(t.status);
  const deslizar = useDeslizar(siguiente ? () => api.avanzar(t.id) : null);

  return (
    <li
      className="xr-fila"
      data-cerrada={cerrada || undefined}
      data-recien={retenida || undefined}
      style={{ "--i": Math.min(indice, 12) } as React.CSSProperties}
    >
      {siguiente && (
        <span className="xr-fila-fondo" aria-hidden data-a={siguiente}>
          <IconoEstado estado={siguiente} size={18} />
          {STATUS_META[siguiente].label}
        </span>
      )}
      <div className="xr-fila-cuerpo" ref={deslizar.ref} {...deslizar.handlers}>
        <BotonEstado t={t} api={api} recien={retenida} />
        <button type="button" className="xr-fila-titulo" onClick={() => !deslizar.acabaDeDeslizar() && api.openDetail(t.id)}>
          {padre && <span className="xr-padre">{padre} ›</span>}
          <span className="xr-titulo-texto">{t.title}</span>
        </button>
        <span className="xr-fila-meta">
          {subtareas && (
            <span className="xr-meta-suave" title={`${subtareas.hechas} de ${subtareas.total} subtareas`}>
              {subtareas.hechas}/{subtareas.total}
            </span>
          )}
          {comentarios > 0 && (
            <span className="xr-meta-suave xr-meta-icono">
              <IconComment width={13} height={13} />
              {comentarios}
            </span>
          )}
          {(t.urgent || t.priority === "High") && <IconoPrioridad prioridad={t.priority} urgente={t.urgent} />}
          {t.due && (
            <span className="xr-fecha" data-tono={cerrada ? undefined : vencida ? "vencida" : hoy ? "hoy" : undefined}>
              {hoy ? "Hoy" : fcorta(t.due, api.today)}
            </span>
          )}
          {responsables.length > 0 && (
            <span className="xr-responsables" title={responsables.join(", ")}>
              {responsables.slice(0, 2).map((n) => (
                <Avatar key={n} name={n} size={20} />
              ))}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

/**
 * El círculo. Tocar avanza; mantener medio segundo (o clic derecho) abre el
 * menú con todos los estados a los que se puede ir.
 */
export function BotonEstado({ t, api, recien }: { t: BoardTask; api: BoardApi; recien: boolean }) {
  const menu = useMenuAnchor();
  const permitidos = TASK_TRANSITIONS[t.status];
  const siguiente = siguientePaso(t.status);
  const largo = useRef<{ timer: number; disparado: boolean } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);

  function abrirMenu() {
    // useMenuAnchor se ancla al currentTarget del evento; el temporizador del
    // toque largo no tiene evento, así que se le da el botón directamente.
    if (permitidos.length && boton.current) menu.toggle({ currentTarget: boton.current } as unknown as React.MouseEvent<HTMLElement>);
  }

  function cancelarLargo() {
    if (largo.current) window.clearTimeout(largo.current.timer);
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        className="xr-estado"
        aria-label={
          siguiente
            ? `${STATUS_META[t.status].label}. Marcar como ${STATUS_META[siguiente].label.toLowerCase()}`
            : STATUS_META[t.status].label
        }
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onPointerDown={() => {
          const estado = { timer: 0, disparado: false };
          estado.timer = window.setTimeout(() => {
            estado.disparado = true;
            navigator.vibrate?.(8);
            abrirMenu();
          }, 480);
          largo.current = estado;
        }}
        onPointerUp={cancelarLargo}
        onPointerLeave={cancelarLargo}
        onPointerCancel={cancelarLargo}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!largo.current?.disparado) abrirMenu();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (largo.current?.disparado) {
            largo.current = null;
            return;
          }
          if (siguiente) api.avanzar(t.id);
          else abrirMenu();
        }}
      >
        <IconoEstado estado={t.status} recien={recien} />
      </button>
      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} label="Cambiar estado" align="start">
          <div className="xr-menu">
            {permitidos.map((to) => (
              <button
                key={to}
                type="button"
                role="menuitem"
                className="xr-menu-item"
                onClick={() => {
                  menu.close();
                  api.cambiarEstado(t.id, to);
                }}
              >
                <IconoEstado estado={to} size={16} />
                {STATUS_META[to].label}
              </button>
            ))}
          </div>
        </MenuSurface>
      )}
    </>
  );
}

/**
 * Deslizar a la derecha para avanzar, solo con el dedo. El navegador sigue
 * dueño del desplazamiento vertical (`touch-action: pan-y` en CSS); solo
 * cuando el gesto es claramente horizontal se toma la fila. Un tirón rápido
 * cuenta aunque no llegue al umbral.
 */
function useDeslizar(alCompletar: (() => void) | null) {
  const ref = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ x: number; y: number; t: number; id: number; horizontal: boolean | null } | null>(null);
  const ultimoDeslizamiento = useRef(0);

  function soltar(dx: number, velocidad: number) {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = "";
    el.parentElement?.removeAttribute("data-deslizando");
    if (alCompletar && (dx > el.offsetWidth * 0.32 || (dx > 28 && velocidad > 0.11))) {
      navigator.vibrate?.(10);
      alCompletar();
    }
  }

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      // Un segundo dedo a mitad del gesto se ignora.
      if (e.pointerType !== "touch" || !alCompletar || gesto.current) return;
      gesto.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, horizontal: null };
    },
    onPointerMove(e: React.PointerEvent) {
      const g = gesto.current;
      const el = ref.current;
      if (!g || e.pointerId !== g.id || !el) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (g.horizontal === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.horizontal = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.2;
        if (!g.horizontal) {
          gesto.current = null;
          return;
        }
        el.setPointerCapture(e.pointerId);
        el.style.transition = "none";
        el.parentElement?.setAttribute("data-deslizando", "");
      }
      // A la izquierda no hay nada que revelar: se frena casi en seco.
      const x = dx >= 0 ? dx : dx * 0.15;
      el.style.transform = `translate3d(${x}px, 0, 0)`;
    },
    onPointerUp(e: React.PointerEvent) {
      const g = gesto.current;
      if (!g || e.pointerId !== g.id) return;
      gesto.current = null;
      if (!g.horizontal) return;
      const dx = e.clientX - g.x;
      ultimoDeslizamiento.current = performance.now();
      soltar(dx, dx / Math.max(1, performance.now() - g.t));
    },
    onPointerCancel(e: React.PointerEvent) {
      const g = gesto.current;
      if (!g || e.pointerId !== g.id) return;
      gesto.current = null;
      if (g.horizontal) soltar(0, 0);
    }
  };

  return {
    ref,
    handlers,
    /** El toque que cierra un deslizamiento no debe abrir además el detalle. */
    acabaDeDeslizar: () => performance.now() - ultimoDeslizamiento.current < 350
  };
}
