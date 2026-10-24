"use client";

// Detalle de una tarea, en la hoja de Execution (cajón en el iPhone, panel
// lateral en escritorio).
//
// Sustituye al drawer anterior, que era un formulario con botón «Guardar
// cambios» seguido de cinco tarjetas apiladas. Aquí:
//   - Lo que ya se sabe por el tablero (título, estado, prioridad, fecha) se
//     pinta al instante; lo demás (notas, personas, archivos, hilo) llega
//     después sin mover lo de arriba.
//   - Cada propiedad se guarda al cambiarla, como en Ajustes del iPhone. Sin
//     botón de guardar que olvidar.
//   - Las subtareas viven aquí: planear un proyecto es abrir una tarea y
//     escribirle los pasos.
//   - Borrar es mantener presionado, no un `confirm()`.

import { useEffect, useRef, useState, useTransition } from "react";
import MenuSurface, { useMenuAnchor } from "@/components/MenuSurface";
import { fcorta } from "@/lib/format";
import type { Priority, TaskStatus } from "@/lib/domain/types.ts";
import { getTaskDetail, updateTaskDetails, updateTaskDescription, type TaskDetailResult } from "./task-detail-actions";
import AssigneesField from "./AssigneesField";
import DepsField from "./DepsField";
import TaskThreadPanel from "./TaskThreadPanel";
import TaskFilesPanel from "./TaskFilesPanel";
import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, TASK_TRANSITIONS } from "./status-meta";
import type { BoardApi, BoardTask } from "./board-types";
import { BotonEstado } from "./LinearList";
import { Interruptor } from "./BoardToolbar";
import Sheet from "./ui/Sheet";
import CapturaRapida from "./ui/CapturaRapida";
import MantenerParaBorrar from "./ui/MantenerParaBorrar";
import { IconoEstado } from "./ui/iconos";
import { aviso } from "./ui/avisos";

export default function TaskSheet({
  task,
  subtareas,
  padre,
  api,
  onClose,
  onOpenTask
}: {
  /** La tarea tal como la tiene el tablero; null cuando la hoja se está cerrando. */
  task: BoardTask | null;
  subtareas: BoardTask[];
  padre: BoardTask | null;
  api: BoardApi;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  // La última tarea mostrada se conserva mientras la hoja sale, para que no
  // se vacíe a mitad de la animación.
  const [mostrada, setMostrada] = useState(task);
  useEffect(() => {
    if (task) setMostrada(task);
  }, [task]);

  return (
    <Sheet open={Boolean(task)} onClose={onClose} title={mostrada?.title ?? "Tarea"} titleHidden>
      {mostrada && (
        <Detalle key={mostrada.id} task={task ?? mostrada} subtareas={subtareas} padre={padre} api={api} onClose={onClose} onOpenTask={onOpenTask} />
      )}
    </Sheet>
  );
}

function Detalle({
  task,
  subtareas,
  padre,
  api,
  onClose,
  onOpenTask
}: {
  task: BoardTask;
  subtareas: BoardTask[];
  padre: BoardTask | null;
  api: BoardApi;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const [detalle, setDetalle] = useState<TaskDetailResult | null>(null);
  const [cargando, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    start(async () => {
      try {
        const d = await getTaskDetail(task.id);
        setDetalle(d);
        setError(null);
        api.setAssignees(task.id, d.assignees);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar la tarea");
      }
    });
  }

  useEffect(cargar, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Guarda una propiedad. updateTaskDetails exige el registro completo, así
   * que se arma con lo que ya hay más el cambio. Se pinta antes de que conteste
   * el servidor y se revierte si falla.
   */
  async function guardar(cambio: Partial<{ title: string; priority: Priority; due: string | null; est: number; urgent: boolean; impact: boolean }>) {
    if (!detalle) return;
    const base = {
      title: task.title,
      priority: task.priority,
      due: task.due,
      est: detalle.task.est,
      urgent: task.urgent,
      impact: detalle.task.impact
    };
    const nuevo = { ...base, ...cambio };
    const fd = new FormData();
    fd.set("taskId", task.id);
    fd.set("title", nuevo.title);
    fd.set("priority", nuevo.priority);
    if (nuevo.due) fd.set("due", nuevo.due);
    fd.set("est", String(nuevo.est));
    if (nuevo.impact) fd.set("impact", "on");
    if (nuevo.urgent) fd.set("urgent", "on");

    api.patchTask(task.id, { title: nuevo.title, priority: nuevo.priority, due: nuevo.due, urgent: nuevo.urgent, est: nuevo.est });
    setDetalle((d) => (d ? { ...d, task: { ...d.task, est: nuevo.est, impact: nuevo.impact } } : d));
    try {
      await updateTaskDetails(fd);
    } catch (e) {
      api.patchTask(task.id, { title: base.title, priority: base.priority, due: base.due, urgent: base.urgent, est: base.est });
      setDetalle((d) => (d ? { ...d, task: { ...d.task, est: base.est, impact: base.impact } } : d));
      aviso({ tono: "error", mensaje: "No se guardó el cambio", detalle: e instanceof Error ? e.message : undefined });
    }
  }

  const retenida = api.retenidas.has(task.id);
  const hechas = subtareas.filter((s) => s.status === "Completed").length;

  return (
    <div className="xr-detalle">
      {padre && (
        <button type="button" className="xr-detalle-padre" onClick={() => onOpenTask(padre.id)}>
          ‹ {padre.title}
        </button>
      )}

      <div className="xr-detalle-titulo">
        <BotonEstado t={task} api={api} recien={retenida} />
        <TituloEditable valor={task.title} onGuardar={(title) => guardar({ title })} deshabilitado={!detalle} />
      </div>

      <dl className="xr-props">
        <Prop etiqueta="Estado">
          <MenuDeEstado task={task} api={api} />
        </Prop>
        <Prop etiqueta="Prioridad">
          <div className="xr-segmentos" role="radiogroup" aria-label="Prioridad">
            {PRIORITY_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={task.priority === p}
                className="xr-segmento"
                disabled={!detalle}
                onClick={() => task.priority !== p && guardar({ priority: p })}
              >
                {PRIORITY_META[p].label}
              </button>
            ))}
          </div>
        </Prop>
        <Prop etiqueta="Fecha">
          <CampoFecha valor={task.due} hoy={api.today} deshabilitado={!detalle} onCambio={(due) => guardar({ due })} />
        </Prop>
        <Prop etiqueta="Urgente">
          <Interruptor label="Urgente" checked={task.urgent} onChange={(urgent) => detalle && guardar({ urgent })} />
        </Prop>
        <Prop etiqueta="Estimado">
          <CampoMinutos valor={detalle?.task.est ?? task.est} deshabilitado={!detalle} onCambio={(est) => guardar({ est })} />
        </Prop>
      </dl>

      <section className="xr-seccion">
        <h3 className="xr-etiqueta">
          Subtareas
          {subtareas.length > 0 && (
            <span className="xr-etiqueta-cuenta">
              {hechas}/{subtareas.length}
            </span>
          )}
        </h3>
        {subtareas.length > 0 && (
          <ul className="xr-subtareas">
            {subtareas.map((s) => (
              <li key={s.id} className="xr-subtarea" data-cerrada={s.status === "Completed" || s.status === "Cancelled" || undefined}>
                <BotonEstado t={s} api={api} recien={api.retenidas.has(s.id)} />
                <button type="button" className="xr-subtarea-titulo" onClick={() => onOpenTask(s.id)}>
                  {s.title}
                </button>
                {s.due && <span className="xr-fecha">{fcorta(s.due, api.today)}</span>}
              </li>
            ))}
          </ul>
        )}
        <CapturaRapida
          projectId={api.projectId}
          parentTaskId={task.id}
          today={api.today}
          placeholder="Agregar subtarea"
          onCreated={api.taskCreated}
        />
      </section>

      {error && <p className="xr-error">{error}</p>}
      {!detalle && cargando && (
        <div className="xr-cargando" aria-label="Cargando">
          <span className="sk" />
          <span className="sk" />
          <span className="sk" />
        </div>
      )}

      {detalle && (
        <>
          <section className="xr-seccion">
            <h3 className="xr-etiqueta">Notas</h3>
            <Notas taskId={task.id} valor={detalle.task.description} />
          </section>

          <section className="xr-seccion xr-incrustado">
            <AssigneesField taskId={task.id} members={detalle.members} selected={detalle.assignees} onSaved={cargar} />
          </section>

          {detalle.depCandidates.length > 0 && (
            <section className="xr-seccion xr-incrustado">
              <DepsField taskId={task.id} candidates={detalle.depCandidates} selected={detalle.task.deps} onSaved={cargar} />
            </section>
          )}

          <section className="xr-seccion xr-incrustado">
            <TaskFilesPanel taskId={task.id} files={detalle.files} onSaved={cargar} />
          </section>

          <section className="xr-seccion xr-incrustado">
            <TaskThreadPanel
              taskId={task.id}
              comments={detalle.comments}
              history={detalle.history}
              reactions={detalle.reactions}
              viewerId={detalle.viewerId}
              roster={detalle.roster}
              onSaved={cargar}
            />
          </section>

          <section className="xr-seccion">
            <MantenerParaBorrar
              etiqueta="borrar"
              onConfirm={() => {
                onClose();
                api.deleteTask(task.id);
                aviso({ mensaje: "Tarea borrada", detalle: task.title });
              }}
            />
          </section>
        </>
      )}
    </div>
  );
}

function Prop({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="xr-prop">
      <dt>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** El título se edita en su sitio; se guarda al salir o con Enter. */
function TituloEditable({ valor, onGuardar, deshabilitado }: { valor: string; onGuardar: (v: string) => void; deshabilitado: boolean }) {
  const [texto, setTexto] = useState(valor);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setTexto(valor), [valor]);

  // Alto automático: el título largo se lee entero, sin barra de scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [texto]);

  function salir() {
    const limpio = texto.trim();
    if (!limpio) setTexto(valor);
    else if (limpio !== valor) onGuardar(limpio);
  }

  return (
    <textarea
      ref={ref}
      className="xr-titulo-campo"
      value={texto}
      rows={1}
      readOnly={deshabilitado}
      aria-label="Título de la tarea"
      onChange={(e) => setTexto(e.target.value.replace(/\n/g, ""))}
      onBlur={salir}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function MenuDeEstado({ task, api }: { task: BoardTask; api: BoardApi }) {
  const menu = useMenuAnchor();
  const permitidos = TASK_TRANSITIONS[task.status];
  return (
    <>
      <button type="button" className="xr-prop-valor" onClick={menu.toggle} disabled={!permitidos.length} aria-haspopup="menu" aria-expanded={menu.open}>
        <IconoEstado estado={task.status} size={15} />
        {STATUS_META[task.status].label}
      </button>
      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} label="Cambiar estado" align="start">
          <div className="xr-menu">
            {permitidos.map((to: TaskStatus) => (
              <button
                key={to}
                type="button"
                role="menuitem"
                className="xr-menu-item"
                onClick={() => {
                  menu.close();
                  api.cambiarEstado(task.id, to);
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
 * Fecha: el selector nativo (en el iPhone, la rueda del sistema) detrás de una
 * ficha legible, más atajos para lo que se elige casi siempre.
 */
function CampoFecha({
  valor,
  hoy,
  deshabilitado,
  onCambio
}: {
  valor: string | null;
  hoy: string;
  deshabilitado: boolean;
  onCambio: (v: string | null) => void;
}) {
  const manana = new Date(`${hoy}T12:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  const mananaISO = manana.toISOString().slice(0, 10);
  const vencida = Boolean(valor && valor < hoy);

  return (
    <div className="xr-fecha-campo">
      <label className="xr-prop-valor" data-tono={vencida ? "vencida" : undefined}>
        {valor ? (valor === hoy ? "Hoy" : fcorta(valor, hoy)) : "Sin fecha"}
        <input
          type="date"
          value={valor ?? ""}
          disabled={deshabilitado}
          onChange={(e) => onCambio(e.target.value || null)}
          aria-label="Elegir fecha"
        />
      </label>
      {valor !== hoy && (
        <button type="button" className="xr-ficha-btn" disabled={deshabilitado} onClick={() => onCambio(hoy)}>
          Hoy
        </button>
      )}
      {valor !== mananaISO && (
        <button type="button" className="xr-ficha-btn" disabled={deshabilitado} onClick={() => onCambio(mananaISO)}>
          Mañana
        </button>
      )}
      {valor && (
        <button type="button" className="xr-ficha-btn" disabled={deshabilitado} onClick={() => onCambio(null)}>
          Quitar
        </button>
      )}
    </div>
  );
}

function CampoMinutos({ valor, deshabilitado, onCambio }: { valor: number; deshabilitado: boolean; onCambio: (v: number) => void }) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  return (
    <span className="xr-minutos">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={5}
        value={texto}
        disabled={deshabilitado}
        aria-label="Minutos estimados"
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const n = Math.max(0, Math.round(Number(texto) || 0));
          setTexto(String(n));
          if (n !== valor) onCambio(n);
        }}
      />
      min
    </span>
  );
}

/** Notas: se guardan solas al salir del campo. */
function Notas({ taskId, valor }: { taskId: string; valor: string }) {
  const [texto, setTexto] = useState(valor);
  const [guardado, setGuardado] = useState(valor);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(88, el.scrollHeight)}px`;
  }, [texto]);

  async function guardar() {
    if (texto === guardado) return;
    const previo = guardado;
    setGuardado(texto);
    try {
      await updateTaskDescription(taskId, texto);
    } catch (e) {
      setGuardado(previo);
      aviso({ tono: "error", mensaje: "No se guardaron las notas", detalle: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <textarea
      ref={ref}
      className="xr-notas"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      placeholder="Contexto, enlaces, lo que haga falta recordar…"
    />
  );
}
