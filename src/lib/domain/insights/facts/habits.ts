// src/lib/domain/insights/facts/habits.ts
// Extractor de hechos de Hábitos y Rutinas — función pura: sin Supabase, sin
// red, sin `new Date()`. El día de corte entra como parámetro (D-016/D-018).
//
// `habitStreak` viene de domain/habits.ts, que es el mismo cálculo que pinta la
// racha en /development/habits. El motor no puede decir "llevas 12 días" si la
// pantalla dice 11.

import { habitStreak } from "../../habits.ts";
import { addDaysISO, diffDays } from "../../datetime.ts";
import type { HabitLogLike } from "../../types.ts";
import { clampWeight, type Fact } from "../types.ts";
import { days } from "./shared.ts";

export type HabitFrequency = "Diario" | "Semanal" | "Entre semana" | "Fin de semana";

export interface HabitFactLike {
  id: string;
  name: string;
  /** La rutina a la que pertenece (0046): un hábito no existe fuera de una. */
  routineId: string;
  /**
   * La frecuencia de esa rutina. El hábito ya no tiene una propia: toca cuando
   * toca su rutina, y ese es el dato con el que se puede juzgar su adherencia.
   */
  routineFrequency: HabitFrequency;
}

export interface RoutineFactLike {
  id: string;
  name: string;
  habitCount: number;
  /** `routines.occupation_id`: el bloque horario que la ancla, si lo tiene. */
  occupationId: string | null;
}

export interface RoutineRunLike {
  routineId: string;
  /** `local_date` de la ejecución. */
  date: string;
}

export interface HabitsSnapshot {
  habits: HabitFactLike[];
  logs: HabitLogLike[];
  routines: RoutineFactLike[];
  routineRuns: RoutineRunLike[];
}

/** Ventana de observación. 30 días es un mes de conducta, no una racha mala. */
const WINDOW_DAYS = 30;

/**
 * Una racha que se rompió, y solo si valía la pena.
 *
 * Se compara la racha de ANTEAYER hacia atrás con la de hoy: si había cadena y
 * ahora no hay, se rompió. El umbral de tres días no es adorno — romper una
 * cadena de dos días no es un hallazgo, es un martes.
 *
 * Se mira desde ayer y no desde hoy a propósito: un hábito que aún no se marca
 * HOY no está roto, está pendiente. Avisar a las nueve de la mañana de que
 * rompiste una racha que todavía puedes cumplir es la forma más rápida de que
 * el usuario deje de creerle al motor.
 */
const STREAK_WORTH_KEEPING = 3;

function brokenStreakFacts(snapshot: HabitsSnapshot, todayISO: string): Fact[] {
  const ayer = addDaysISO(todayISO, -1);
  const anteayer = addDaysISO(todayISO, -2);
  const facts: Fact[] = [];

  for (const habit of snapshot.habits) {
    const hechoAyer = snapshot.logs.some((l) => l.habitId === habit.id && l.date === ayer);
    if (hechoAyer) continue;

    const rachaPrevia = habitStreak(habit.id, snapshot.logs, anteayer);
    if (rachaPrevia < STREAK_WORTH_KEEPING) continue;

    facts.push({
      id: `habits.streak-broken.${habit.id}`,
      domain: "habits",
      label: `"${habit.name}" venía de ${days(rachaPrevia)} seguidos y ayer se rompió`,
      // Dos semanas de cadena perdida pesa 1: cuanto más larga era, más cuesta
      // reconstruirla y más urgente es retomarla hoy.
      weight: clampWeight(rachaPrevia / 14),
      refs: [{ table: "habits", id: habit.id }]
    });
  }
  return facts;
}

/**
 * Un hábito diario que se cumple menos de la mitad de los días.
 *
 * Solo se juzgan los de rutina `Diario`: para los demás el esquema no guarda
 * qué días tocaban, así que contar 8 de 30 en un hábito semanal diría que va
 * fatal cuando va perfecto. Preferimos no opinar antes que opinar mal. Desde
 * 0046 el hábito ya no tiene frecuencia propia —la pone su rutina—, así que se
 * juzga por la de `routineFrequency`.
 *
 * Y solo si el hábito lleva vivo la ventana entera —hay algún registro
 * anterior—, porque un hábito creado el jueves lleva 2 de 30 por definición.
 */
const ADHERENCE_FLOOR = 0.5;

function lowAdherenceFacts(snapshot: HabitsSnapshot, todayISO: string): Fact[] {
  const desde = addDaysISO(todayISO, -WINDOW_DAYS);
  const facts: Fact[] = [];

  for (const habit of snapshot.habits) {
    if (habit.routineFrequency !== "Diario") continue;

    const suyos = snapshot.logs.filter((l) => l.habitId === habit.id);
    if (!suyos.length) continue;

    // ¿Existía ya al abrirse la ventana? Sin esto, un hábito nuevo siempre
    // aparece como incumplido.
    const primero = suyos.reduce((a, b) => (b.date < a.date ? b : a)).date;
    const diasVivo = Math.min(WINDOW_DAYS, diffDays(primero, todayISO) + 1);
    if (diasVivo < WINDOW_DAYS) continue;

    const cumplidos = suyos.filter((l) => l.date > desde && l.date <= todayISO).length;
    const tasa = cumplidos / WINDOW_DAYS;
    if (tasa >= ADHERENCE_FLOOR) continue;

    facts.push({
      id: `habits.low-adherence.${habit.id}`,
      domain: "habits",
      label: `"${habit.name}" es diario y se cumplió ${cumplidos} de los últimos ${WINDOW_DAYS} días (${Math.round(tasa * 100)} %)`,
      // Cumplir 0 de 30 pesa 1; cumplir justo la mitad, 0.
      weight: clampWeight((ADHERENCE_FLOOR - tasa) / ADHERENCE_FLOOR),
      refs: [{ table: "habits", id: habit.id }]
    });
  }
  return facts;
}

/**
 * Una rutina que se dejó de ejecutar.
 *
 * Una rutina abandonada pesa distinto que un hábito suelto: son varios hábitos
 * que alguien encadenó a propósito, y se dejan de cumplir todos juntos. Por eso
 * el peso llega al máximo antes (dos semanas, no un mes).
 *
 * Una rutina que NUNCA se ejecutó no entra por la misma razón que el proyecto
 * recién creado en execution: no está abandonada, no ha empezado.
 */
const ROUTINE_ABANDONED_AFTER_DAYS = 7;

function abandonedRoutineFacts(snapshot: HabitsSnapshot, todayISO: string): Fact[] {
  const facts: Fact[] = [];
  for (const routine of snapshot.routines) {
    const suyas = snapshot.routineRuns.filter((r) => r.routineId === routine.id);
    if (!suyas.length) continue;

    const ultima = suyas.reduce((a, b) => (b.date > a.date ? b : a)).date;
    const sinCorrer = diffDays(ultima, todayISO);
    if (sinCorrer < ROUTINE_ABANDONED_AFTER_DAYS) continue;

    facts.push({
      id: `habits.routine-abandoned.${routine.id}`,
      domain: "habits",
      label: `La rutina "${routine.name}" (${routine.habitCount} hábitos) no se ejecuta desde hace ${days(sinCorrer)}`,
      weight: clampWeight(sinCorrer / 14),
      refs: [{ table: "routines", id: routine.id }]
    });
  }
  return facts;
}

/**
 * Rutinas sin bloque horario que las ancle, en UN solo hecho agregado.
 *
 * El "a qué hora" no es un campo más: `routines.occupation_id` es justo el
 * dato con el que una rutina sin hora concreta se delata como un propósito.
 * Desde 0046 el bloque lo declara la rutina, no cada hábito suelto —por eso
 * `habits.occupation_id` se borró como duplicado—, así que este hecho se mira
 * ahora por rutina y no por hábito. Emitir uno por cada rutina sin anclar
 * llenaría el contexto con la misma frase repetida, así que va el recuento y
 * hasta tres nombres.
 *
 * Solo se reporta si es MAYORÍA: con dos de nueve sin anclar, el usuario ya
 * sabe lo que hace.
 */
function noAnchorFacts(snapshot: HabitsSnapshot): Fact[] {
  if (!snapshot.routines.length) return [];
  const sinAncla = snapshot.routines.filter((r) => !r.occupationId);
  const proporcion = sinAncla.length / snapshot.routines.length;
  if (proporcion <= 0.5) return [];

  return [
    {
      id: "habits.no-anchor",
      domain: "habits",
      label:
        `${sinAncla.length} de ${snapshot.routines.length} rutinas no tienen un bloque horario asignado: ` +
        sinAncla.slice(0, 3).map((r) => `"${r.name}"`).join(", "),
      // Todas sin anclar pesa 0.5: es un patrón que conviene contar, no una
      // emergencia. Nunca debe desplazar a una racha rota de dos semanas.
      weight: clampWeight(proporcion / 2),
      refs: sinAncla.slice(0, 5).map((r) => ({ table: "routines", id: r.id }))
    }
  ];
}

/** Todos los hechos de hábitos, ordenados de más a menos anómalo. */
export function habitsFacts(snapshot: HabitsSnapshot, todayISO: string): Fact[] {
  return [
    ...brokenStreakFacts(snapshot, todayISO),
    ...lowAdherenceFacts(snapshot, todayISO),
    ...abandonedRoutineFacts(snapshot, todayISO),
    ...noAnchorFacts(snapshot)
  ].sort((a, b) => b.weight - a.weight);
}
