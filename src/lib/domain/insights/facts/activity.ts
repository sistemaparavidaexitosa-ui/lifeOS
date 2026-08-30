// src/lib/domain/insights/facts/activity.ts
// Extractor de hechos de la actividad del espacio — función pura: sin Supabase,
// sin red, sin `new Date()`. El día de corte entra como parámetro (D-016/D-018).
//
// LO QUE ESTE ARCHIVO NO DICE NUNCA: quién.
//
// Los otros cinco extractores hablan de los datos del propio usuario. Este habla
// de lo que ha hecho su EQUIPO, y ahí la seudonimización del motor no alcanza:
// `buildAliasMap` cubre cuentas y dependientes, no a los compañeros de espacio,
// y `workspace_activity.actor` guarda un correo. Mandar correos o nombres de
// terceros al modelo para que redacte «Ana lleva dos días sin contestarte» es
// una línea que este módulo no cruza.
//
// Así que los hechos cuentan y describen —cuántas menciones, qué proyecto
// concentra el movimiento, cuántos días de silencio— y el usuario abre el hilo
// para ver quién. Se pierde algo de color; no se pierde nada accionable.

import { diffDays } from "../../datetime.ts";
import { clampWeight, type Fact } from "../types.ts";
import { days } from "./shared.ts";

export interface ActivityRowLike {
  id: string;
  type: string;
  projectId: string | null;
  /** ISO con hora. */
  at: string;
}

export interface UnreadMentionLike {
  commentId: string;
  taskId: string;
  taskTitle: string;
  /** ISO con hora. */
  at: string;
  /** ¿Hubo algún comentario POSTERIOR en ese mismo hilo? */
  answered: boolean;
}

export interface ProjectTitleLike {
  id: string;
  title: string;
}

export interface ActivitySnapshot {
  /** Actividad del espacio, la que quepa en la ventana que cargue quien llama. */
  rows: ActivityRowLike[];
  mentions: UnreadMentionLike[];
  projects: ProjectTitleLike[];
}

/** Ventana de observación: una semana es «lo que me perdí», un mes es un informe. */
const WINDOW_DAYS = 7;

/**
 * Menciones sin leer, en UN hecho.
 *
 * Una por mención llenaría el contexto con la misma frase repetida y expulsaría
 * al resto de dominios, que es exactamente lo que el tope de `MAX_FACTS`
 * castiga. Va el recuento y la más antigua, que es de lo que se habla.
 */
function unreadMentionFacts(snapshot: ActivitySnapshot, todayISO: string): Fact[] {
  if (!snapshot.mentions.length) return [];

  const masAntigua = snapshot.mentions.reduce((a, b) => (b.at < a.at ? b : a));
  const espera = diffDays(masAntigua.at.slice(0, 10), todayISO);

  return [
    {
      id: "activity.unread-mentions",
      domain: "activity",
      label:
        `Tienes ${snapshot.mentions.length} mención(es) sin leer. La más antigua es de hace ${days(espera)}, ` +
        `en "${masAntigua.taskTitle}"`,
      // Una semana esperando pesa 1: a partir de ahí, quien preguntó ya se
      // cansó de esperar.
      weight: clampWeight(Math.max(espera / 7, snapshot.mentions.length / 5)),
      refs: snapshot.mentions.slice(0, 5).map((m) => ({ table: "comments", id: m.commentId }))
    }
  ];
}

/**
 * Te mencionaron y el hilo se quedó callado.
 *
 * Es distinto de «sin leer»: puede que ya lo hayas visto. Lo que dice este hecho
 * es que después de esa mención NADIE escribió nada, así que si quien preguntaba
 * esperaba respuesta, sigue esperando. Es el único de este archivo que señala
 * una deuda con otra persona, y por eso pesa aunque la mención esté leída.
 *
 * Dos días de gracia: una mención de esta mañana sin contestar no es un
 * hallazgo, es una mañana normal.
 */
const UNANSWERED_AFTER_DAYS = 2;

function unansweredMentionFacts(snapshot: ActivitySnapshot, todayISO: string): Fact[] {
  const facts: Fact[] = [];

  for (const mention of snapshot.mentions) {
    if (mention.answered) continue;
    const espera = diffDays(mention.at.slice(0, 10), todayISO);
    if (espera < UNANSWERED_AFTER_DAYS) continue;

    facts.push({
      id: `activity.mention-unanswered.${mention.commentId}`,
      domain: "activity",
      label: `Te mencionaron en "${mention.taskTitle}" hace ${days(espera)} y nadie ha escrito nada después`,
      weight: clampWeight(espera / 7),
      refs: [{ table: "comments", id: mention.commentId }]
    });
  }

  return facts;
}

/**
 * El proyecto que concentra el movimiento de la semana.
 *
 * Solo se reporta si de verdad concentra —más de la mitad— y si hay algo con lo
 * que comparar. Con dos eventos en total, decir que uno acapara el 100 % es
 * cierto y es ruido, así que hace falta un mínimo absoluto.
 */
const MIN_ROWS_FOR_CONCENTRATION = 6;
const CONCENTRATION_FLOOR = 0.5;

function busyProjectFacts(snapshot: ActivitySnapshot, todayISO: string): Fact[] {
  const recientes = snapshot.rows.filter((r) => diffDays(r.at.slice(0, 10), todayISO) < WINDOW_DAYS);
  if (recientes.length < MIN_ROWS_FOR_CONCENTRATION) return [];

  const porProyecto = new Map<string, number>();
  for (const r of recientes) {
    if (!r.projectId) continue;
    porProyecto.set(r.projectId, (porProyecto.get(r.projectId) ?? 0) + 1);
  }
  if (porProyecto.size < 2) return [];

  const [topId, topCount] = [...porProyecto.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
  const proporcion = topCount / recientes.length;
  if (proporcion <= CONCENTRATION_FLOOR) return [];

  const titulo = snapshot.projects.find((p) => p.id === topId)?.title ?? "un proyecto";

  return [
    {
      id: `activity.busy-project.${topId}`,
      domain: "activity",
      label:
        `"${titulo}" concentra ${topCount} de los ${recientes.length} movimientos del espacio ` +
        `en los últimos ${WINDOW_DAYS} días (${Math.round(proporcion * 100)} %)`,
      // Acaparar el 100 % pesa 1; justo la mitad, 0.
      weight: clampWeight((proporcion - CONCENTRATION_FLOOR) * 2),
      refs: [{ table: "projects", id: topId }]
    }
  ];
}

/**
 * El espacio se quedó callado.
 *
 * Solo si ANTES hubo ruido: un espacio recién creado no está en silencio, está
 * empezando. Es el mismo criterio que el proyecto que nunca completó nada y la
 * rutina que nunca se ejecutó.
 */
const QUIET_AFTER_DAYS = 10;

function quietFacts(snapshot: ActivitySnapshot, todayISO: string): Fact[] {
  if (!snapshot.rows.length) return [];

  const ultima = snapshot.rows.reduce((a, b) => (b.at > a.at ? b : a));
  const silencio = diffDays(ultima.at.slice(0, 10), todayISO);
  if (silencio < QUIET_AFTER_DAYS) return [];

  return [
    {
      id: "activity.quiet",
      domain: "activity",
      label: `El espacio no registra ningún movimiento desde hace ${days(silencio)}`,
      // Un mes de silencio pesa 1.
      weight: clampWeight(silencio / 30),
      refs: [{ table: "workspace_activity", id: ultima.id }]
    }
  ];
}

/** Todos los hechos de actividad, ordenados de más a menos anómalo. */
export function activityFacts(snapshot: ActivitySnapshot, todayISO: string): Fact[] {
  return [
    ...unreadMentionFacts(snapshot, todayISO),
    ...unansweredMentionFacts(snapshot, todayISO),
    ...busyProjectFacts(snapshot, todayISO),
    ...quietFacts(snapshot, todayISO)
  ].sort((a, b) => b.weight - a.weight);
}
