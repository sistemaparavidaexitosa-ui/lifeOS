"use client";

// LA LISTA: la vista por defecto de un proyecto, pensada para el iPhone.
//
// Por defecto es un árbol: cada tarea principal con sus subtareas debajo,
// hasta tres subniveles (arbol.ts). Así se planea un proyecto: la tarea
// grande arriba, sus pasos colgando, y al pie de cada rama un campo para el
// siguiente paso. Lo hecho se pliega solo («2 hechas»; las principales
// cerradas bajan a «Hechas»). La hoja «Mostrar» la cambia a agrupar por
// estado, por fecha o sin grupos.
//
// Marcar no pregunta nada:
//   - tocar el círculo avanza un paso (Sin empezar → Trabajando → Hecho);
//   - deslizar la fila a la derecha hace lo mismo con el pulgar;
//   - deslizarla a la izquierda abre «Añadir subtarea» debajo de ella;
//   - mantener el círculo (o clic derecho) abre todos los estados posibles.
// Cada cambio deja un aviso con «Deshacer» y la fila se queda en su sitio
// hasta que se guarda (ver `retenidas` en board-types.ts).
//
// Plegar y desplegar es instantáneo: se hace muchas veces y una altura
// animada solo haría esperar. Solo gira la flecha.
//
// Muta el MISMO estado que las demás vistas (`BoardApi`).

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import MenuSurface, { useMenuAnchor } from "@/components/MenuSurface";
import { Avatar } from "@/components/ui";
import { IconComment, IconPlus } from "@/components/icons";
import { fcorta } from "@/lib/format";
import { siguientePaso } from "@/lib/domain/execution/avance.ts";
import {
  MAX_SUBNIVELES,
  agruparPlano,
  construirArbol,
  type ClaveSeccion,
  type Nodo,
  type Presentacion
} from "@/lib/domain/execution/arbol.ts";
import type { TaskStatus } from "@/lib/domain/types.ts";
import { STATUS_META, TASK_TRANSITIONS } from "./status-meta";
import type { BoardApi, BoardTask } from "./board-types";
import CapturaRapida from "./ui/CapturaRapida";
import { Chevron, IconoEstado, IconoPrioridad } from "./ui/iconos";

const TITULO_SECCION: Record<ClaveSeccion, string> = {
  Pending: STATUS_META.Pending.label,
  InProgress: STATUS_META.InProgress.label,
  Blocked: STATUS_META.Blocked.label,
  Rescheduled: STATUS_META.Rescheduled.label,
  Completed: STATUS_META.Completed.label,
  Cancelled: STATUS_META.Cancelled.label,
  vencidas: "Vencidas",
  hoy: "Hoy",
  manana: "Mañana",
  semana: "Esta semana",
  despues: "Más adelante",
  sinfecha: "Sin fecha",
  todas: "",
  hechas: "Hechas"
};

const ESTADOS = new Set<string>(Object.keys(STATUS_META));

interface Avance {
  hechas: number;
  total: number;
}

export default function LinearList({
  api,
  tasks,
  coincide,
  presentacion,
  plegados,
  alternarPlegado,
  desplegar,
  filtro,
  onQuitarFiltro
}: {
  api: BoardApi;
  /** TODAS las tareas: el árbol necesita a los padres aunque el filtro no los elija. */
  tasks: BoardTask[];
  /** Sin filtro activo, undefined. */
  coincide?: (t: BoardTask) => boolean;
  presentacion: Presentacion;
  plegados: Set<string>;
  alternarPlegado: (id: string) => void;
  desplegar: (id: string) => void;
  /** Nombre del filtro activo, para el vacío («Nada en Hoy»). */
  filtro: string | null;
  onQuitarFiltro: () => void;
}) {
  // La cascada de entrada, solo la primera vez: filtrar o marcar no vuelve a
  // animar la lista entera.
  const [entrando, setEntrando] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setEntrando(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  // Dónde está abierta una captura que no estaría a la vista por sí sola
  // (deslizar a la izquierda una tarea que aún no tiene subtareas).
  const [agregandoEn, setAgregandoEn] = useState<string | null>(null);

  const estadoDe = useMemo(() => {
    const r = api.retenidas;
    return (t: BoardTask) => r.get(t.id) ?? t.status;
  }, [api.retenidas]);

  const filtrando = Boolean(coincide);

  function agregar(id: string) {
    // Todo dentro del mismo toque: si el foco llega en un efecto posterior,
    // Safari en el iPhone no abre el teclado.
    flushSync(() => {
      setAgregandoEn(id);
      desplegar(id);
    });
    document.querySelector<HTMLInputElement>(`[data-captura-de="${id}"] input`)?.focus();
  }

  const indice = { n: 0 };
  const ctx: Ctx = { api, plegados, alternarPlegado, agregar, agregandoEn, setAgregandoEn, filtrando, indice };

  const captura = (
    <CapturaRapida
      projectId={api.projectId}
      groupId={api.groups[0]?.id ?? null}
      today={api.today}
      placeholder="Nueva tarea · «mañana alta»"
      onCreated={api.taskCreated}
    />
  );

  const vacio = (
    <div className="xr-vacio">
      {filtro ? (
        <>
          <p className="xr-vacio-titulo">Nada en «{filtro}»</p>
          <p>
            <button type="button" className="xr-enlace" onClick={onQuitarFiltro}>
              Ver todo
            </button>
          </p>
        </>
      ) : (
        <>
          <p className="xr-vacio-titulo">Nada por aquí</p>
          <p>Escribe la primera tarea arriba. Puedes terminarla con «mañana», «viernes» o «alta».</p>
        </>
      )}
    </div>
  );

  if (presentacion.agrupar !== "principal") {
    return (
      <div className="xr-lista" data-entrando={entrando || undefined}>
        {captura}
        <ListaPlana
          key={presentacion.agrupar}
          tasks={tasks}
          presentacion={presentacion}
          coincide={coincide}
          estadoDe={estadoDe}
          ctx={ctx}
          vacio={vacio}
        />
      </div>
    );
  }

  return (
    <div className="xr-lista" data-entrando={entrando || undefined}>
      {captura}
      <Arbol tasks={tasks} presentacion={presentacion} coincide={coincide} estadoDe={estadoDe} ctx={ctx} vacio={vacio} />
    </div>
  );
}

interface Ctx {
  api: BoardApi;
  plegados: Set<string>;
  alternarPlegado: (id: string) => void;
  agregar: (id: string) => void;
  agregandoEn: string | null;
  setAgregandoEn: (id: string | null) => void;
  filtrando: boolean;
  /** Contador de filas para la cascada de entrada (se reinicia en cada render). */
  indice: { n: number };
}

function Arbol({
  tasks,
  presentacion,
  coincide,
  estadoDe,
  ctx,
  vacio
}: {
  tasks: BoardTask[];
  presentacion: Presentacion;
  coincide?: (t: BoardTask) => boolean;
  estadoDe: (t: BoardTask) => TaskStatus;
  ctx: Ctx;
  vacio: React.ReactNode;
}) {
  const [verCerradas, setVerCerradas] = useState(false);
  const arbol = useMemo(
    () => construirArbol(tasks, { orden: presentacion.orden, hechas: presentacion.hechas, coincide, estadoDe }),
    [tasks, presentacion.orden, presentacion.hechas, coincide, estadoDe]
  );

  if (!arbol.abiertas.length && !arbol.cerradas.length) return <>{vacio}</>;

  return (
    <>
      {arbol.abiertas.length > 0 && (
        <ul className="xr-filas">
          {arbol.abiertas.map((n) => (
            <Rama key={n.tarea.id} n={n} ctx={ctx} />
          ))}
        </ul>
      )}
      {arbol.cerradas.length > 0 && (
        <section className="xr-grupo">
          <button type="button" className="xr-grupo-cabeza" onClick={() => setVerCerradas((v) => !v)} aria-expanded={verCerradas}>
            <Chevron abierto={verCerradas} />
            <IconoEstado estado="Completed" size={15} />
            <span className="xr-grupo-nombre">Hechas</span>
            <span className="xr-grupo-cuenta">{arbol.cerradas.length}</span>
          </button>
          {verCerradas && (
            <ul className="xr-filas">
              {arbol.cerradas.map((n) => (
                <Rama key={n.tarea.id} n={n} ctx={ctx} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function Rama({ n, ctx }: { n: Nodo<BoardTask>; ctx: Ctx }) {
  const id = n.tarea.id;
  const [verHechas, setVerHechas] = useState(false);
  const tieneHijas = n.hijos.length + n.hechas.length > 0;
  const plegado = tieneHijas && ctx.plegados.has(id);
  const puedeTenerHijas = n.nivel < MAX_SUBNIVELES;
  const agregando = ctx.agregandoEn === id;
  // Al filtrar no se ofrece: la subtarea nueva no pasaría el filtro y
  // desaparecería nada más crearla.
  const conCaptura = puedeTenerHijas && !ctx.filtrando && ((tieneHijas && !plegado) || agregando);
  const abierta = !plegado && (tieneHijas || conCaptura);

  return (
    <li className="xr-nodo">
      <Fila
        t={n.tarea}
        api={ctx.api}
        indice={ctx.indice.n++}
        nivel={n.nivel}
        avance={n.avance}
        contexto={n.contexto ? n.visibles : null}
        masHondas={n.masHondas}
        plegable={tieneHijas ? { plegado, alternar: () => ctx.alternarPlegado(id) } : null}
        onAgregar={puedeTenerHijas ? () => ctx.agregar(id) : null}
      />
      {abierta && (
        <ul className="xr-rama" style={{ "--nivel": n.nivel + 1 } as React.CSSProperties}>
          {n.hijos.map((h) => (
            <Rama key={h.tarea.id} n={h} ctx={ctx} />
          ))}
          {n.hechas.length > 0 && (
            <li>
              <button
                type="button"
                className="xr-ver-hechas"
                onClick={() => setVerHechas((v) => !v)}
                aria-expanded={verHechas}
              >
                <Chevron abierto={verHechas} />
                {n.hechas.length === 1 ? "1 hecha" : `${n.hechas.length} hechas`}
              </button>
            </li>
          )}
          {verHechas &&
            n.hechas.map((h) => (
              <Rama key={h.tarea.id} n={h} ctx={ctx} />
            ))}
          {conCaptura && (
            <li>
              <CapturaRapida
                variante="fila"
                nivel={n.nivel + 1}
                projectId={ctx.api.projectId}
                parentTaskId={id}
                today={ctx.api.today}
                placeholder="Añadir subtarea"
                onCreated={ctx.api.taskCreated}
                alSalirVacio={agregando ? () => ctx.setAgregandoEn(null) : undefined}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function ListaPlana({
  tasks,
  presentacion,
  coincide,
  estadoDe,
  ctx,
  vacio
}: {
  tasks: BoardTask[];
  presentacion: Presentacion;
  coincide?: (t: BoardTask) => boolean;
  estadoDe: (t: BoardTask) => TaskStatus;
  ctx: Ctx;
  vacio: React.ReactNode;
}) {
  const agrupar = presentacion.agrupar === "principal" ? "ninguno" : presentacion.agrupar;
  const secciones = useMemo(
    () => agruparPlano(tasks, agrupar, { orden: presentacion.orden, hechas: presentacion.hechas, today: ctx.api.today, coincide, estadoDe }),
    [tasks, agrupar, presentacion.orden, presentacion.hechas, ctx.api.today, coincide, estadoDe]
  );
  const titulos = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  const avances = useMemo(() => {
    const m = new Map<string, Avance>();
    for (const t of tasks) {
      if (!t.parentTaskId || estadoDe(t) === "Cancelled") continue;
      const c = m.get(t.parentTaskId) ?? { hechas: 0, total: 0 };
      c.total += 1;
      if (estadoDe(t) === "Completed") c.hechas += 1;
      m.set(t.parentTaskId, c);
    }
    return m;
  }, [tasks, estadoDe]);

  // Lo plegado de cada sección: lo que sugiere arbol.ts, hasta que se toque.
  const [tocadas, setTocadas] = useState<Map<ClaveSeccion, boolean>>(new Map());

  if (!secciones.length) return <>{vacio}</>;

  return (
    <>
      {secciones.map((s) => {
        const plegada = tocadas.get(s.clave) ?? s.plegada;
        const titulo = TITULO_SECCION[s.clave];
        const filas = (
          <ul className="xr-filas">
            {s.tareas.map((t) => (
              <li key={t.id} className="xr-nodo">
                <Fila
                  t={t}
                  api={ctx.api}
                  indice={ctx.indice.n++}
                  nivel={0}
                  padre={t.parentTaskId ? (titulos.get(t.parentTaskId) ?? null) : null}
                  avance={avances.get(t.id) ?? null}
                  contexto={null}
                  masHondas={0}
                  plegable={null}
                  onAgregar={null}
                />
              </li>
            ))}
          </ul>
        );
        if (!titulo) return <section key={s.clave}>{filas}</section>;
        return (
          <section key={s.clave} className="xr-grupo">
            <button
              type="button"
              className="xr-grupo-cabeza"
              onClick={() => setTocadas((m) => new Map(m).set(s.clave, !plegada))}
              aria-expanded={!plegada}
            >
              <Chevron abierto={!plegada} />
              {ESTADOS.has(s.clave) && <IconoEstado estado={s.clave as TaskStatus} size={15} />}
              <span className="xr-grupo-nombre">{titulo}</span>
              <span className="xr-grupo-cuenta">{s.tareas.length}</span>
            </button>
            {!plegada && filas}
          </section>
        );
      })}
    </>
  );
}

function Fila({
  t,
  api,
  indice,
  nivel,
  padre = null,
  avance,
  contexto,
  masHondas,
  plegable,
  onAgregar
}: {
  t: BoardTask;
  api: BoardApi;
  indice: number;
  nivel: number;
  /** Solo sin árbol: el título del padre delante del propio. */
  padre?: string | null;
  avance: Avance | null;
  /** Nodo de contexto de un filtro: cuántas de sus hijas coinciden. */
  contexto: number | null;
  masHondas: number;
  plegable: { plegado: boolean; alternar: () => void } | null;
  onAgregar: (() => void) | null;
}) {
  const cerrada = t.status === "Completed" || t.status === "Cancelled";
  const vencida = Boolean(t.due && t.due < api.today && !cerrada);
  const hoy = t.due === api.today;
  const responsables = api.assigneesByTask[t.id] ?? [];
  const comentarios = api.commentCountByTask[t.id] ?? 0;
  const retenida = api.retenidas.has(t.id);
  const siguiente = siguientePaso(t.status);
  const deslizar = useDeslizar(siguiente ? () => api.avanzar(t.id) : null, onAgregar);

  const cuenta = contexto !== null ? `${contexto} de ${avance?.total ?? contexto}` : avance ? `${avance.hechas}/${avance.total}` : null;
  const tituloCuenta =
    contexto !== null
      ? `${contexto} subtareas coinciden con el filtro`
      : avance
        ? `${avance.hechas} de ${avance.total} subtareas hechas`
        : undefined;

  return (
    <div
      className="xr-fila"
      data-cerrada={cerrada || undefined}
      data-recien={retenida || undefined}
      data-contexto={contexto !== null || undefined}
      data-nivel={nivel}
      style={{ "--i": Math.min(indice, 12), "--nivel": nivel } as React.CSSProperties}
    >
      {siguiente && (
        <span className="xr-fila-fondo" aria-hidden data-a={siguiente}>
          <IconoEstado estado={siguiente} size={18} />
          {STATUS_META[siguiente].label}
        </span>
      )}
      {onAgregar && (
        <span className="xr-fila-fondo xr-fila-fondo-izq" aria-hidden>
          Subtarea
          <IconPlus width={18} height={18} />
        </span>
      )}
      <div className="xr-fila-cuerpo" ref={deslizar.ref} {...deslizar.handlers}>
        <BotonEstado t={t} api={api} recien={retenida} />
        <button type="button" className="xr-fila-titulo" onClick={() => !deslizar.acabaDeDeslizar() && api.openDetail(t.id)}>
          {padre && <span className="xr-padre">{padre} ›</span>}
          <span className="xr-titulo-texto">{t.title}</span>
        </button>
        <span className="xr-fila-meta">
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
              {responsables.slice(0, 2).map((nombre) => (
                <Avatar key={nombre} name={nombre} size={20} />
              ))}
            </span>
          )}
          {masHondas > 0 && (
            <button
              type="button"
              className="xr-meta-suave xr-mas-hondas"
              onClick={() => api.openDetail(t.id)}
              title={`${masHondas} subtareas más adentro: se ven en el detalle`}
            >
              +{masHondas}
            </button>
          )}
          {onAgregar && (
            <button type="button" className="xr-fila-agregar" onClick={onAgregar} aria-label={`Añadir subtarea a «${t.title}»`}>
              <IconPlus width={15} height={15} />
            </button>
          )}
          {plegable ? (
            <button
              type="button"
              className="xr-plegar"
              onClick={plegable.alternar}
              aria-expanded={!plegable.plegado}
              aria-label={`${plegable.plegado ? "Desplegar" : "Plegar"} subtareas${tituloCuenta ? ` (${tituloCuenta})` : ""}`}
            >
              {cuenta && <span className="xr-meta-suave">{cuenta}</span>}
              <Chevron abierto={!plegable.plegado} />
            </button>
          ) : (
            cuenta && (
              <span className="xr-meta-suave" title={tituloCuenta}>
                {cuenta}
              </span>
            )
          )}
        </span>
      </div>
    </div>
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
 * Deslizar con el dedo: a la derecha avanza el estado, a la izquierda abre
 * «Añadir subtarea». El navegador sigue dueño del desplazamiento vertical
 * (`touch-action: pan-y` en CSS); solo cuando el gesto es claramente
 * horizontal se toma la fila. Un tirón rápido cuenta aunque no llegue al
 * umbral. Hacia un lado sin acción, la fila se frena casi en seco.
 */
function useDeslizar(alDerecha: (() => void) | null, alIzquierda: (() => void) | null) {
  const ref = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ x: number; y: number; t: number; id: number; horizontal: boolean | null } | null>(null);
  const ultimoDeslizamiento = useRef(0);

  function soltar(dx: number, velocidad: number) {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = "";
    el.parentElement?.removeAttribute("data-deslizando");
    const lejos = (d: number) => d > el.offsetWidth * 0.32 || (d > 28 && Math.abs(velocidad) > 0.11);
    if (alDerecha && dx > 0 && lejos(dx)) {
      navigator.vibrate?.(10);
      alDerecha();
    } else if (alIzquierda && dx < 0 && lejos(-dx)) {
      navigator.vibrate?.(10);
      alIzquierda();
    }
  }

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      // Un segundo dedo a mitad del gesto se ignora.
      if (e.pointerType !== "touch" || (!alDerecha && !alIzquierda) || gesto.current) return;
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
        g.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2 && Boolean(dx > 0 ? alDerecha : alIzquierda);
        if (!g.horizontal) {
          gesto.current = null;
          return;
        }
        el.setPointerCapture(e.pointerId);
        el.style.transition = "none";
      }
      // El fondo que asoma depende del lado; hacia uno sin acción, fricción.
      const lado = dx >= 0 ? "der" : "izq";
      el.parentElement?.setAttribute("data-deslizando", lado);
      const conAccion = lado === "der" ? alDerecha : alIzquierda;
      const x = conAccion ? dx : dx * 0.15;
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
