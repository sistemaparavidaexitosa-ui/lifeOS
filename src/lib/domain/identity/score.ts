// src/lib/domain/identity/score.ts
// Identity Score v1 — lógica pura (probada en tests/domain/identity-score.test.ts).
//
// LA PREGUNTA
// «¿Qué tan alineadas están tus acciones diarias con la persona que quieres
// ser?». No mide cuántas casillas marcas: pondera lo que haces por los rasgos
// que declaraste, junto con constancia, equilibrio entre áreas, ritmo de tus
// metas, adherencia a rutinas y reflexión. Las definiciones están en D-160.
//
// Un componente sin datos NO vale 0: no existe, y los pesos de los demás se
// renormalizan. Sin rasgos todavía, la puntuación no te castiga por no haber
// configurado tu identidad; te mide con lo que sí hay.

import { addDaysISO, diffDays } from "../datetime.ts";
import type { HabitSeries } from "../development/habit-analytics.ts";
import { completionRate } from "../development/habit-analytics.ts";
import { areaOfCategory, areaRates, recencyWeightedRate } from "../development/habit-dashboard.ts";
import { goalExpectedPct } from "../development/goals.ts";

/** Súbela cuando cambie cualquier peso o definición: las fotos guardadas la llevan. */
export const FORMULA_VERSION = 1;

export type ScoreKey = "votos" | "constancia" | "equilibrio" | "metas" | "rutinas" | "reflexion";

export interface ScoreComponent {
  key: ScoreKey;
  label: string;
  /** Peso nominal sobre 100, antes de renormalizar. */
  weight: number;
  /** 0..100, o null si no hay con qué calcularlo. */
  value: number | null;
  /** Qué mide, para explicarlo en pantalla. */
  help: string;
}

export interface IdentityScore {
  score: number | null;
  components: ScoreComponent[];
  formulaVersion: number;
}

export interface ScoreInputs {
  today: string;
  series: HabitSeries[];
  /** Área de vida de cada hábito, ya resuelta (ver `resolveHabitAreas`). */
  habitAreas: Record<string, string>;
  traits: { id: string; active: boolean }[];
  votes: { habitId: string; traitId: string }[];
  /** Metas activas con su avance. Sin horizonte no hay ritmo que juzgar. */
  goals: { progressPct: number; startISO: string; horizonISO: string | null }[];
  /** Adherencia 0..100 de cada rutina activa. */
  routineAdherence: number[];
  /** Días con check-in, reflexión o aprendizaje en la bitácora. */
  reflectionDays: string[];
}

const DEFINICION: { key: ScoreKey; label: string; weight: number; help: string }[] = [
  { key: "votos", label: "Votos por tu identidad", weight: 25, help: "Cumplimiento de 30 días de los hábitos vinculados a cada rasgo activo, en promedio por rasgo." },
  { key: "constancia", label: "Constancia", weight: 25, help: "Cumplimiento de 30 días de todos tus hábitos; la última semana pesa el doble." },
  { key: "equilibrio", label: "Equilibrio de áreas", weight: 15, help: "Promedio por área de vida: un área fuerte no tapa una descuidada." },
  { key: "metas", label: "Ritmo de metas", weight: 15, help: "100 menos lo que tus metas activas van por detrás del ritmo esperado." },
  { key: "rutinas", label: "Adherencia a rutinas", weight: 10, help: "Días en que tus rutinas activas se completaron, de los que tocaban." },
  { key: "reflexion", label: "Reflexión", weight: 10, help: "Días de las últimas dos semanas con check-in, reflexión o aprendizaje." }
];

function media(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function identityScore(input: ScoreInputs): IdentityScore {
  const { today, series } = input;
  const desde30 = addDaysISO(today, -29);
  const porHabito = new Map(series.map((s) => [s.habitId, s]));

  // Votos: cada rasgo activo con hábitos vinculados cuenta una vez, tenga uno o
  // cinco hábitos. Si no, el rasgo con más hábitos dominaría la media.
  const activos = new Set(input.traits.filter((t) => t.active).map((t) => t.id));
  const porRasgo = new Map<string, HabitSeries[]>();
  for (const v of input.votes) {
    const s = porHabito.get(v.habitId);
    if (!s || !activos.has(v.traitId)) continue;
    porRasgo.set(v.traitId, [...(porRasgo.get(v.traitId) ?? []), s]);
  }
  const votos = media(
    [...porRasgo.values()].map((ss) => completionRate(ss, desde30, today, today)).filter((x): x is number => x !== null)
  );

  const constancia = recencyWeightedRate(series, today);

  const equilibrio = media(
    areaRates(series, (id) => input.habitAreas[id] ?? "Personal", today)
      .map((a) => a.pct)
      .filter((x): x is number => x !== null)
  );

  const metas = media(
    input.goals
      .filter((g): g is typeof g & { horizonISO: string } => g.horizonISO !== null)
      .map((g) => 100 - Math.max(0, goalExpectedPct(g.startISO, g.horizonISO, today) - g.progressPct))
  );

  const rutinas = media(input.routineAdherence);

  // La ventana de reflexión no empieza antes del primer hábito: quien empezó
  // anteayer no puede haber reflexionado catorce días.
  const primerHabito = series.map((s) => s.createdOn).sort()[0];
  const dias = primerHabito ? Math.min(14, Math.max(1, diffDays(primerHabito, today) + 1)) : 14;
  const desdeReflexion = addDaysISO(today, -(dias - 1));
  const reflexionados = new Set(input.reflectionDays.filter((d) => d >= desdeReflexion && d <= today));
  const reflexion = series.length ? (reflexionados.size / dias) * 100 : null;

  const valores: Record<ScoreKey, number | null> = { votos, constancia, equilibrio, metas, rutinas, reflexion };
  const components = DEFINICION.map((d) => ({
    ...d,
    value: valores[d.key] === null ? null : Math.round(valores[d.key]!)
  }));

  // Sin constancia no hay puntuación: sin hábitos juzgables no hay acciones que
  // comparar con nadie, y un número hecho solo de metas y reflexión no contesta
  // la pregunta.
  if (constancia === null) return { score: null, components, formulaVersion: FORMULA_VERSION };

  let suma = 0;
  let peso = 0;
  for (const c of DEFINICION) {
    const v = valores[c.key];
    if (v === null) continue;
    suma += v * c.weight;
    peso += c.weight;
  }
  return { score: Math.round(suma / peso), components, formulaVersion: FORMULA_VERSION };
}

/**
 * El área de vida de cada hábito: la del primer rasgo activo por el que vota
 * (por `position`), o la que corresponde a su categoría si no vota por ninguno.
 * El rasgo manda porque lo eligió la persona; la categoría es un valor por
 * defecto del formulario.
 */
export function resolveHabitAreas(
  habits: { id: string; category: string }[],
  traits: { id: string; area: string; active: boolean; position: number }[],
  votes: { habitId: string; traitId: string }[]
): Record<string, string> {
  const rasgo = new Map(traits.filter((t) => t.active).map((t) => [t.id, t]));
  const areas: Record<string, string> = {};
  for (const h of habits) {
    const suyos = votes
      .filter((v) => v.habitId === h.id)
      .map((v) => rasgo.get(v.traitId))
      .filter((t): t is NonNullable<typeof t> => t !== undefined)
      .sort((a, b) => a.position - b.position);
    areas[h.id] = suyos[0]?.area ?? areaOfCategory(h.category);
  }
  return areas;
}
