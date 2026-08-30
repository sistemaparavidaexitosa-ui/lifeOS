// src/lib/domain/insights/facts/execution.ts
// Extractor de hechos de Execution OS — función pura: sin Supabase, sin red,
// sin `new Date()`. El día de corte entra como parámetro (D-016/D-018).
//
// `isOverdue` no se reimplementa: viene de domain/task-state.ts, donde BR-006
// ya dice que Overdue es un estado DERIVADO y nunca se persiste. Si el motor
// tuviera su propia idea de qué está vencido, tarde o temprano contaría como
// atrasada una tarea que la pantalla pinta en verde.

import { isOverdue } from "../../task-state.ts";
import { diffDays } from "../../datetime.ts";
import type { ProjectStatus, TaskStatus } from "../../types.ts";
import { clampWeight, type Fact } from "../types.ts";
import { days } from "./shared.ts";

export interface ExecutionTaskLike {
  id: string;
  title: string;
  projectId: string;
  status: TaskStatus;
  due: string | null;
  /** Dependencias declaradas (`tasks.deps`). */
  deps: string[];
  /** `completed_at`, en ISO date. Null mientras la tarea siga abierta. */
  completedAtISO: string | null;
}

export interface ExecutionProjectLike {
  id: string;
  title: string;
  status: ProjectStatus;
}

export interface ExecutionSnapshot {
  projects: ExecutionProjectLike[];
  tasks: ExecutionTaskLike[];
}

const OPEN_STATUSES: TaskStatus[] = ["Pending", "InProgress", "Blocked", "Rescheduled"];

function isOpen(task: ExecutionTaskLike): boolean {
  return OPEN_STATUSES.includes(task.status);
}

/**
 * Lo vencido, en UN hecho y no en uno por tarea.
 *
 * Quince tareas atrasadas son quince hechos que llenan el contexto y empujan
 * fuera al resto de dominios — y el modelo no necesita las quince para decir lo
 * que hay que decir. Se le da el recuento, la más antigua y su retraso, que es
 * de lo que se habla.
 *
 * El peso es la PROPORCIÓN de lo abierto que está vencido, no el número: tres
 * de cinco es una cartera en problemas; tres de doscientas, una tarde mala.
 */
function overdueFacts(snapshot: ExecutionSnapshot, todayISO: string): Fact[] {
  const abiertas = snapshot.tasks.filter(isOpen);
  const vencidas = abiertas.filter((t) => isOverdue({ status: t.status, due: t.due }, todayISO));
  if (!vencidas.length) return [];

  const masAntigua = vencidas.reduce((a, b) => ((b.due ?? "") < (a.due ?? "") ? b : a));
  const retraso = masAntigua.due ? diffDays(masAntigua.due, todayISO) : 0;

  return [
    {
      id: "execution.overdue",
      domain: "execution",
      label:
        `${vencidas.length} de ${abiertas.length} tareas abiertas están vencidas. ` +
        `La más antigua es "${masAntigua.title}", con ${days(retraso)} de retraso`,
      weight: clampWeight(vencidas.length / abiertas.length),
      refs: vencidas.slice(0, 5).map((t) => ({ table: "tasks", id: t.id }))
    }
  ];
}

/**
 * Proyecto activo con trabajo abierto y sin nada terminado en semanas.
 *
 * "Estancado" se mide por lo ÚLTIMO COMPLETADO, no por lo último tocado: mover
 * una tarea de columna, renombrarla o reasignarla deja rastro de actividad sin
 * que el proyecto avance ni un paso. Terminar algo es la única señal que no se
 * puede fingir.
 *
 * Un proyecto sin ninguna tarea completada nunca —recién creado— no entra: no
 * está estancado, no ha empezado, y decirle a alguien que su proyecto de ayer
 * lleva dos semanas parado es la clase de hallazgo que hace desinstalar la app.
 */
const STALLED_AFTER_DAYS = 14;

function stalledFacts(snapshot: ExecutionSnapshot, todayISO: string): Fact[] {
  const facts: Fact[] = [];
  for (const project of snapshot.projects) {
    if (project.status !== "Active") continue;

    const delProyecto = snapshot.tasks.filter((t) => t.projectId === project.id);
    const abiertas = delProyecto.filter(isOpen);
    if (!abiertas.length) continue;

    const completadas = delProyecto.map((t) => t.completedAtISO).filter((d): d is string => Boolean(d));
    if (!completadas.length) continue;

    const ultima = completadas.reduce((a, b) => (b > a ? b : a));
    const sinAvance = diffDays(ultima, todayISO);
    if (sinAvance < STALLED_AFTER_DAYS) continue;

    facts.push({
      id: `execution.stalled.${project.id}`,
      domain: "execution",
      label: `"${project.title}" lleva ${days(sinAvance)} sin completar ninguna tarea y tiene ${abiertas.length} abiertas`,
      // Un mes sin avance pesa 1.
      weight: clampWeight(sinAvance / 30),
      refs: [{ table: "projects", id: project.id }]
    });
  }
  return facts;
}

/**
 * Tareas que ya se pueden empezar y siguen esperando.
 *
 * Una tarea Pending con dependencias declaradas y TODAS completas está
 * desbloqueada y nadie se enteró: el desbloqueo no genera ningún aviso, ocurre
 * cuando se completa otra cosa. Es el único hecho de este archivo que señala
 * una oportunidad en vez de un problema, y por eso vale: el usuario no lo va a
 * descubrir mirando su tablero.
 *
 * Solo cuentan las que declaran dependencias. Una tarea Pending sin
 * dependencias no está "desbloqueada": nunca estuvo bloqueada.
 */
function unblockedFacts(snapshot: ExecutionSnapshot): Fact[] {
  const statusById = new Map(snapshot.tasks.map((t) => [t.id, t.status]));

  const desbloqueadas = snapshot.tasks.filter((t) => {
    if (t.status !== "Pending" || !t.deps.length) return false;
    // Una dependencia que ya no existe no bloquea: se borró la tarea, no el
    // trabajo. Solo cuentan las que siguen vivas y sin terminar.
    return t.deps.every((id) => !statusById.has(id) || statusById.get(id) === "Completed");
  });
  if (!desbloqueadas.length) return [];

  const titulos = desbloqueadas.slice(0, 3).map((t) => `"${t.title}"`).join(", ");
  return [
    {
      id: "execution.unblocked",
      domain: "execution",
      label:
        `${desbloqueadas.length} tarea(s) tienen todas sus dependencias completas y siguen en Pendiente: ${titulos}` +
        (desbloqueadas.length > 3 ? ", entre otras" : ""),
      // Tres o más esperando sin motivo pesa 1: es trabajo listo, parado.
      weight: clampWeight(desbloqueadas.length / 3),
      refs: desbloqueadas.slice(0, 5).map((t) => ({ table: "tasks", id: t.id }))
    }
  ];
}

/**
 * Demasiadas cosas empezadas a la vez.
 *
 * El umbral es 5, y es una convención prestada del trabajo en curso de Kanban,
 * no una medición de este usuario. Se dice así en el hecho —"más de N"— para
 * que el modelo no lo presente como una ley y el usuario pueda no estar de
 * acuerdo. Si acaba molestando, la memoria del motor es el sitio donde se
 * apaga sin tocar código.
 */
const WIP_LIMIT = 5;

function wipFacts(snapshot: ExecutionSnapshot): Fact[] {
  const enCurso = snapshot.tasks.filter((t) => t.status === "InProgress");
  if (enCurso.length <= WIP_LIMIT) return [];
  return [
    {
      id: "execution.wip",
      domain: "execution",
      label: `Tienes ${enCurso.length} tareas En Progreso al mismo tiempo (por encima de las ${WIP_LIMIT} que se suelen tomar como límite práctico)`,
      // El doble del límite pesa 1.
      weight: clampWeight((enCurso.length - WIP_LIMIT) / WIP_LIMIT),
      refs: enCurso.slice(0, 5).map((t) => ({ table: "tasks", id: t.id }))
    }
  ];
}

/**
 * Tareas bloqueadas, que es un estado que el usuario puso a mano y luego se
 * olvida de quitar. Se cuenta cuántas y desde qué proyecto, sin fecha: el
 * esquema no guarda cuándo se bloqueó.
 */
function blockedFacts(snapshot: ExecutionSnapshot): Fact[] {
  const bloqueadas = snapshot.tasks.filter((t) => t.status === "Blocked");
  if (!bloqueadas.length) return [];
  const abiertas = snapshot.tasks.filter(isOpen).length || 1;
  return [
    {
      id: "execution.blocked",
      domain: "execution",
      label: `${bloqueadas.length} tarea(s) están marcadas como Bloqueadas: ${bloqueadas.slice(0, 3).map((t) => `"${t.title}"`).join(", ")}`,
      weight: clampWeight(bloqueadas.length / abiertas),
      refs: bloqueadas.slice(0, 5).map((t) => ({ table: "tasks", id: t.id }))
    }
  ];
}

/** Todos los hechos de ejecución, ordenados de más a menos anómalo. */
export function executionFacts(snapshot: ExecutionSnapshot, todayISO: string): Fact[] {
  return [
    ...overdueFacts(snapshot, todayISO),
    ...stalledFacts(snapshot, todayISO),
    ...unblockedFacts(snapshot),
    ...wipFacts(snapshot),
    ...blockedFacts(snapshot)
  ].sort((a, b) => b.weight - a.weight);
}
