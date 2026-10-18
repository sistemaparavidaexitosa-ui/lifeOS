"use client";

// LA LISTA (rediseño, estilo Linear): la vista por defecto de un proyecto.
//
// Una fila por tarea, agrupadas por ESTADO —lo que más importa al trabajar es
// qué está en curso y qué sigue, no en qué grupo se creó—. Cada fila dice lo
// justo: estado (icono que se toca para cambiarlo), título (abre el detalle en
// el panel lateral sin salir de la lista), prioridad, fecha y responsables.
// Capturar es escribir y Enter, arriba de todo. Lo hecho y lo cancelado se
// pliegan: siguen ahí, sin estorbar.
//
// Muta el MISMO estado que las demás vistas (`BoardApi`): cambiar a Tablero
// nunca pierde nada.

import { useMemo, useState, useTransition } from "react";
import MenuSurface, { useMenuAnchor } from "@/components/MenuSurface";
import { Avatar } from "@/components/ui";
import { fcorta } from "@/lib/format";
import type { Priority, TaskStatus } from "@/lib/domain/types.ts";
import { setTaskStatus } from "./actions";
import { STATUS_META, TASK_TRANSITIONS } from "./status-meta";
import QuickAddRow from "./QuickAddRow";
import type { BoardApi, BoardTask } from "./board-types";

const ORDEN: TaskStatus[] = ["InProgress", "Pending", "Blocked", "Rescheduled", "Completed", "Cancelled"];
const PLEGADOS_AL_INICIO = new Set<TaskStatus>(["Completed", "Cancelled"]);
const PESO_PRIORIDAD: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export default function LinearList({ api, tasks }: { api: BoardApi; tasks: BoardTask[] }) {
  const [plegados, setPlegados] = useState<Set<TaskStatus>>(() => new Set(PLEGADOS_AL_INICIO));
  const titulos = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);

  const grupos = useMemo(
    () =>
      ORDEN.map((estado) => ({
        estado,
        tareas: tasks
          .filter((t) => t.status === estado)
          // Lo urgente y lo que vence antes, arriba; luego el orden manual.
          .sort(
            (a, b) =>
              Number(b.urgent) - Number(a.urgent) ||
              PESO_PRIORIDAD[a.priority] - PESO_PRIORIDAD[b.priority] ||
              (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
              a.position - b.position
          )
      })).filter((g) => g.tareas.length > 0),
    [tasks]
  );

  function alternar(estado: TaskStatus) {
    setPlegados((prev) => {
      const s = new Set(prev);
      if (s.has(estado)) s.delete(estado);
      else s.add(estado);
      return s;
    });
  }

  return (
    <div className="ln-lista">
      <div className="ln-captura">
        <QuickAddRow projectId={api.projectId} groupId={api.groups[0]?.id ?? null} placeholder="Nueva tarea… (Enter para crear)" onCreated={api.taskCreated} />
      </div>

      {!grupos.length && <p className="ln-vacio">Este proyecto no tiene tareas. Escribe la primera arriba.</p>}

      {grupos.map(({ estado, tareas }) => {
        const plegado = plegados.has(estado);
        return (
          <section key={estado} className="ln-grupo">
            <button type="button" className="ln-grupo-cabeza" onClick={() => alternar(estado)} aria-expanded={!plegado}>
              <IconoChevron abierto={!plegado} />
              <IconoEstado estado={estado} />
              <span className="ln-grupo-nombre">{STATUS_META[estado].label}</span>
              <span className="ln-grupo-cuenta">{tareas.length}</span>
            </button>
            {!plegado && (
              <ul className="ln-filas">
                {tareas.map((t) => (
                  <Fila key={t.id} t={t} api={api} padre={t.parentTaskId ? (titulos.get(t.parentTaskId) ?? null) : null} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Fila({ t, api, padre }: { t: BoardTask; api: BoardApi; padre: string | null }) {
  const vencida = Boolean(t.due && t.due < api.today && t.status !== "Completed" && t.status !== "Cancelled");
  const hoy = t.due === api.today;
  const responsables = api.assigneesByTask[t.id] ?? [];
  const comentarios = api.commentCountByTask[t.id] ?? 0;
  return (
    <li className="ln-fila" data-hecha={t.status === "Completed" || t.status === "Cancelled" || undefined}>
      <MenuEstado t={t} api={api} />
      <button type="button" className="ln-fila-titulo" onClick={() => api.openDetail(t.id)}>
        {padre && <span className="ln-padre">{padre} ›</span>}
        <span className="ln-titulo-texto">{t.title}</span>
        {comentarios > 0 && <span className="ln-meta-suave">💬 {comentarios}</span>}
      </button>
      <span className="ln-fila-meta">
        <IconoPrioridad prioridad={t.priority} urgente={t.urgent} />
        {t.due && <span className={`ln-fecha${vencida ? " es-vencida" : hoy ? " es-hoy" : ""}`}>{hoy ? "Hoy" : fcorta(t.due, api.today)}</span>}
        {responsables.length > 0 && (
          <span className="ln-responsables" title={responsables.join(", ")}>
            {responsables.slice(0, 2).map((n) => (
              <Avatar key={n} name={n} size={20} />
            ))}
          </span>
        )}
      </span>
    </li>
  );
}

function MenuEstado({ t, api }: { t: BoardTask; api: BoardApi }) {
  const menu = useMenuAnchor();
  const [pendiente, start] = useTransition();
  const permitidos = TASK_TRANSITIONS[t.status];

  function elegir(to: TaskStatus) {
    menu.close();
    const antes = t.status;
    api.setStatus(t.id, to);
    start(async () => {
      try {
        await setTaskStatus(t.id, to);
      } catch (e) {
        api.setStatus(t.id, antes);
        api.reportError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="ln-estado"
        onClick={(e) => permitidos.length > 0 && menu.toggle(e)}
        aria-label={`Estado: ${STATUS_META[t.status].label}. Cambiar`}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        disabled={pendiente}
      >
        <IconoEstado estado={t.status} />
      </button>
      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} label="Cambiar estado" align="start">
          <div className="ln-menu">
            {permitidos.map((to) => (
              <button key={to} type="button" role="menuitem" className="ln-menu-item" onClick={() => elegir(to)}>
                <IconoEstado estado={to} />
                {STATUS_META[to].label}
              </button>
            ))}
          </div>
        </MenuSurface>
      )}
    </>
  );
}

/** Los iconos de estado de Linear: el círculo se llena conforme avanza. */
export function IconoEstado({ estado }: { estado: TaskStatus }) {
  const color = STATUS_META[estado].color;
  const props = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true as const, className: "ln-icono-estado" };
  switch (estado) {
    case "Pending":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="1.6" />
        </svg>
      );
    case "InProgress":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="1.6" />
          <path d="M8 4a4 4 0 0 1 0 8z" fill={color} />
        </svg>
      );
    case "Blocked":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="1.6" />
          <path d="m4.2 11.8 7.6-7.6" stroke={color} strokeWidth="1.6" />
        </svg>
      );
    case "Rescheduled":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="1.6" strokeDasharray="2.4 2" />
        </svg>
      );
    case "Completed":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="7" fill={color} />
          <path d="m5 8.2 2 2 4-4.2" fill="none" stroke="var(--bg)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "Cancelled":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="7" fill={color} />
          <path d="m5.6 5.6 4.8 4.8m0-4.8-4.8 4.8" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
  }
}

/** Prioridad como barras (1–3); urgente, un cuadro rojo con «!». */
function IconoPrioridad({ prioridad, urgente }: { prioridad: Priority; urgente: boolean }) {
  if (urgente) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-label="Urgente" role="img">
        <rect width="14" height="14" rx="3.5" fill="var(--danger)" />
        <path d="M7 3.5v4.2M7 10v.3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  const n = prioridad === "High" ? 3 : prioridad === "Medium" ? 2 : 1;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-label={`Prioridad ${prioridad === "High" ? "alta" : prioridad === "Medium" ? "media" : "baja"}`} role="img">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={1 + i * 4.5} y={9 - i * 3.5} width="3" height={4 + i * 3.5} rx="1" fill={i < n ? "var(--text)" : "var(--surface3)"} />
      ))}
    </svg>
  );
}

function IconoChevron({ abierto }: { abierto: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="ln-chevron" style={{ transform: abierto ? "rotate(90deg)" : undefined }}>
      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
