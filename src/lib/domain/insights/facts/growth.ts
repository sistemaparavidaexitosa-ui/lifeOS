// src/lib/domain/insights/facts/growth.ts
// Extractor de hechos de Desarrollo Personal — función pura: sin Supabase, sin
// red, sin `new Date()`. El día de corte entra como parámetro (D-016/D-018).
//
// Este dominio no existía antes de 0053, y no porque las metas no importaran:
// `personal_goals` y `key_results` están en la base desde 0024. Lo que faltaba
// era un sitio donde el motor pudiera decir algo sobre ellas, y una casilla que
// encender para que salieran hacia el modelo. Sin eso, «¿cómo van mis metas?»
// era literalmente incontestable.
//
// `goalProgress` y `goalAtRisk` vienen de domain/development/goals.ts, que es
// el mismo cálculo que pinta la pantalla de /development/goals. El motor no
// puede decir «vas al 40 %» si la barra que el usuario tiene al lado dice otra
// cosa: sería la misma clase de contradicción que el simulador de deuda.

import { diffDays } from "../../datetime.ts";
import { goalAtRisk } from "../../development/goals.ts";
import { clampWeight, type Fact } from "../types.ts";
import { days } from "./shared.ts";

export interface GoalLike {
  id: string;
  title: string;
  /** `Salud`, `Carrera`, … El área es lo que hace útil el hecho: dice qué parte de la vida se quedó parada. */
  area: string;
  /** `Activa` | `Pausada` | `Lograda` | `Abandonada`. Solo las activas producen hechos. */
  status: string;
  /** `personal_goals.horizon`. `null` = sin fecha, y entonces no hay nada contra qué medir el ritmo. */
  horizon: string | null;
  /** `created_at` recortado a fecha. Es el arranque contra el que se mide el ritmo esperado. */
  createdAt: string;
  /** Cuántos resultados clave tiene. Cero es el caso interesante. */
  keyResults: number;
  /**
   * Avance 0-100 ya calculado con `goalProgress`, para no calcularlo dos veces
   * distinto. `null` cuando quien carga no pudo resolver las fuentes de los
   * resultados clave —es el caso del mensaje diario, que corre sin sesión y no
   * puede llamar a `loadSourceSnapshot()`—. Un `null` NO es un 0: se calla el
   * porcentaje en vez de afirmar que no ha avanzado nada.
   */
  pct: number | null;
}

export interface BookLike {
  id: string;
  title: string;
  /** El estado de la biblioteca. Solo el que se está leyendo produce hechos. */
  status: string;
  currentPage: number;
  totalPages: number;
  /** Fecha del último `book_progress`, o `null` si nunca se registró ninguno. */
  lastProgressISO: string | null;
}

export interface GrowthSnapshot {
  goals: GoalLike[];
  books: BookLike[];
}

const ACTIVA = "Activa";
const LEYENDO = "Leyendo";

function activas(snapshot: GrowthSnapshot): GoalLike[] {
  return snapshot.goals.filter((g) => g.status === ACTIVA);
}

/**
 * Una meta sin ningún resultado clave.
 *
 * Es el hecho más importante de este archivo y el que más se parece a lo que
 * un coach diría en voz alta: sin resultados clave la meta no tiene forma de
 * avanzar —el avance NO se teclea en este módulo, se calcula de las fuentes—,
 * así que se queda al 0 % para siempre y la pantalla la muestra como si el
 * usuario no hubiera hecho nada. No es que no haya hecho nada: es que no hay
 * nada midiendo.
 *
 * Pesa alto y fijo. No admite grados: o hay algo que medir o no lo hay.
 */
function sinResultadosFacts(snapshot: GrowthSnapshot): Fact[] {
  return activas(snapshot)
    .filter((g) => g.keyResults === 0)
    .map((g) => ({
      id: `growth.goal-no-kr.${g.id}`,
      domain: "growth" as const,
      label:
        `La meta "${g.title}" (${g.area}) está activa y no tiene ningún resultado clave, ` +
        `así que su avance se queda en 0 % pase lo que pase: no hay nada midiéndola`,
      weight: 0.85,
      refs: [{ table: "personal_goals", id: g.id }]
    }));
}

/**
 * El horizonte ya pasó y la meta sigue en `Activa`.
 *
 * Nadie va a /development/goals a cerrar una meta vencida, y una lista donde la
 * mitad venció hace meses deja de leerse entera. El hecho no dice si lograrla o
 * abandonarla: dice que hay que decidirlo, que es lo único que se puede afirmar
 * desde los datos.
 */
function vencidasFacts(snapshot: GrowthSnapshot, todayISO: string): Fact[] {
  const facts: Fact[] = [];
  for (const g of activas(snapshot)) {
    if (!g.horizon || g.horizon >= todayISO) continue;
    const retraso = diffDays(g.horizon, todayISO);
    facts.push({
      id: `growth.goal-overdue.${g.id}`,
      domain: "growth",
      label:
        `La meta "${g.title}" (${g.area}) venció hace ${days(retraso)} —su horizonte era el ${g.horizon}— ` +
        `y sigue marcada como activa` +
        (g.pct === null ? "" : `, al ${g.pct} %`),
      // Tres meses de retraso pesa 1.
      weight: clampWeight(retraso / 90),
      refs: [{ table: "personal_goals", id: g.id }]
    });
  }
  return facts;
}

/**
 * El calendario va más adelantado que el avance.
 *
 * Se delega en `goalAtRisk`, que es la MISMA resta que decide el aviso de la
 * pantalla. Duplicar el umbral aquí garantizaría que un día digan cosas
 * distintas sobre la misma meta.
 *
 * Las vencidas no entran: ya tienen su hecho, y decir dos veces lo mismo gasta
 * dos de los huecos del contexto.
 */
function enRiesgoFacts(snapshot: GrowthSnapshot, todayISO: string): Fact[] {
  const facts: Fact[] = [];
  for (const g of activas(snapshot)) {
    if (!g.horizon || g.horizon < todayISO) continue;
    if (g.keyResults === 0) continue; // sin nada que medir, "en riesgo" no significa nada
    if (g.pct === null) continue; // sin avance resuelto no hay nada que comparar contra el calendario
    if (!goalAtRisk(g.createdAt, g.horizon, g.pct, todayISO)) continue;

    const total = diffDays(g.createdAt, g.horizon);
    const transcurrido = diffDays(g.createdAt, todayISO);
    const esperado = total > 0 ? Math.min(100, Math.round((transcurrido / total) * 100)) : 100;

    facts.push({
      id: `growth.goal-at-risk.${g.id}`,
      domain: "growth",
      label:
        `La meta "${g.title}" (${g.area}) va al ${g.pct} % cuando por calendario tocaría ${esperado} %: ` +
        `quedan ${days(diffDays(todayISO, g.horizon))} hasta el ${g.horizon}`,
      // Cincuenta puntos de desfase pesa 1.
      weight: clampWeight((esperado - g.pct) / 50),
      refs: [{ table: "personal_goals", id: g.id }]
    });
  }
  return facts;
}

/**
 * Un libro empezado que dejó de avanzar.
 *
 * Catorce días es el umbral por el mismo criterio que la rutina abandonada: por
 * debajo es una semana ocupada, por encima es un libro que se quedó en la mesa.
 * Un libro SIN ningún progreso registrado nunca no cuenta — quien lee sin
 * anotar páginas no tiene un problema de lectura, tiene otra forma de llevarla,
 * y avisarle cada día es la manera de que deje de leer los avisos.
 */
const LIBRO_PARADO_DIAS = 14;

function libroParadoFacts(snapshot: GrowthSnapshot, todayISO: string): Fact[] {
  const facts: Fact[] = [];
  for (const b of snapshot.books) {
    if (b.status !== LEYENDO || !b.lastProgressISO) continue;
    const silencio = diffDays(b.lastProgressISO, todayISO);
    if (silencio < LIBRO_PARADO_DIAS) continue;

    const restantes = Math.max(0, b.totalPages - b.currentPage);
    facts.push({
      id: `growth.book-stalled.${b.id}`,
      domain: "growth",
      label:
        `"${b.title}" lleva ${days(silencio)} sin avanzar, en la página ${b.currentPage} de ${b.totalPages}` +
        (restantes > 0 ? ` (faltan ${restantes})` : ""),
      // Dos meses parado pesa 1.
      weight: clampWeight(silencio / 60),
      refs: [{ table: "books", id: b.id }]
    });
  }
  return facts;
}

/**
 * Ninguna meta activa.
 *
 * Es el único hecho de este archivo que habla de una AUSENCIA, y existe porque
 * el coach necesita poder decirlo: sin metas, todo lo demás —proyectos,
 * rutinas, agenda— avanza sin nada hacia lo que avanzar. Un solo hecho, no uno
 * por área, porque «no tienes metas de Carrera» sería inventarle al usuario una
 * vida que no ha dicho que quiera.
 */
function sinMetasFacts(snapshot: GrowthSnapshot): Fact[] {
  if (activas(snapshot).length > 0) return [];
  return [
    {
      id: "growth.no-goals",
      domain: "growth",
      label: "No hay ninguna meta personal activa",
      weight: 0.5,
      refs: []
    }
  ];
}

/** Todos los hechos de desarrollo personal, ordenados de más a menos anómalo. */
export function growthFacts(snapshot: GrowthSnapshot, todayISO: string): Fact[] {
  return [
    ...sinResultadosFacts(snapshot),
    ...vencidasFacts(snapshot, todayISO),
    ...enRiesgoFacts(snapshot, todayISO),
    ...libroParadoFacts(snapshot, todayISO),
    ...sinMetasFacts(snapshot)
  ].sort((a, b) => b.weight - a.weight);
}
