// src/lib/domain/development/nutrition.ts
// Toda la aritmética del módulo de nutrición. Puro: sin React, sin Supabase,
// sin `fetch` y sin `new Date()` — el día de corte entra como parámetro
// (D-016/D-018), como en el resto del dominio.
//
// La página no calcula nada. Si aquí falta una cuenta, la cuenta va aquí.

import { addDaysISO, diffDays } from "../datetime.ts";

export type Sex = "Hombre" | "Mujer";
export type ActivityLevel = "Sedentario" | "Ligero" | "Moderado" | "Alto" | "Muy alto";
export type NutritionGoal = "Perder" | "Mantener" | "Ganar";
export type Meal = "Desayuno" | "Almuerzo" | "Cena" | "Snack";

/** En orden de pantalla, que es el del día, no el alfabético. */
export const MEALS: readonly Meal[] = ["Desayuno", "Almuerzo", "Cena", "Snack"];

/** Los multiplicadores habituales de Mifflin-St Jeor. */
export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  Sedentario: 1.2,
  Ligero: 1.375,
  Moderado: 1.55,
  Alto: 1.725,
  "Muy alto": 1.9
};

/**
 * El déficit y el superávit, en kcal sobre el gasto total.
 *
 * −500 es el medio kilo por semana de manual; +300 es deliberadamente más
 * corto que su simétrico, porque ganar rápido es ganar grasa.
 */
export const GOAL_DELTA_KCAL: Record<NutritionGoal, number> = { Perder: -500, Mantener: 0, Ganar: 300 };

/**
 * Qué se considera «cumplir el día»: ±10 % del objetivo.
 *
 * **La banda es SIMÉTRICA, y es una postura.** Quedarse un 20 % por debajo no
 * es cumplir mejor: es otro desvío. Un módulo que premiara comer de menos
 * estaría empujando en una dirección en la que no debe empujar.
 */
export const KCAL_BAND = 0.1;

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export const ZERO_MACROS: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export interface BodyProfileLike {
  sex: Sex;
  /** ISO date. */
  birthDate: string;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: NutritionGoal;
  proteinGPerKg: number;
  fatPct: number;
  kcalOverride: number | null;
}

const redondea = (n: number) => Math.round(n);
const unDecimal = (n: number) => Math.round(n * 10) / 10;

/** La edad cumplida el día `todayISO`, contando el cumpleaños como cumplido. */
export function ageOn(birthDateISO: string, todayISO: string): number {
  const edad = Number(todayISO.slice(0, 4)) - Number(birthDateISO.slice(0, 4));
  // "MM-DD" contra "MM-DD": comparar las cadenas es exacto y evita separar la
  // fecha en piezas que después hay que comprobar una a una.
  return todayISO.slice(5) < birthDateISO.slice(5) ? edad - 1 : edad;
}

/**
 * Mifflin-St Jeor, y no Harris-Benedict: valida mejor en población no
 * deportista y es la que usa todo el mercado, así que el usuario puede
 * contrastar el número con cualquier otra app en vez de tener que fiarse.
 */
export function basalMetabolicRate(p: BodyProfileLike, todayISO: string): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * ageOn(p.birthDate, todayISO);
  return redondea(base + (p.sex === "Hombre" ? 5 : -161));
}

export function totalEnergyExpenditure(p: BodyProfileLike, todayISO: string): number {
  return redondea(basalMetabolicRate(p, todayISO) * ACTIVITY_FACTOR[p.activityLevel]);
}

export interface DailyTargets extends Macros {
  source: "perfil" | "override";
  /** El déficit pedía menos que el suelo y se aplicó el suelo. La UI lo dice. */
  floored: boolean;
  /** Proteína y grasa no cabían en las kcal; los carbohidratos quedaron en 0. */
  impossibleSplit: boolean;
}

/** Suelo duro por sexo. Por debajo del basal ya no es un objetivo, es un ayuno. */
const SUELO_DURO: Record<Sex, number> = { Hombre: 1500, Mujer: 1200 };

/**
 * Los objetivos del día. NO se guardan en la base: se calculan, para que
 * cambiar de peso no deje cuatro números viejos que nadie recalcula.
 *
 * El suelo es la única parte de esto que no es aritmética sino criterio: por
 * debajo del metabolismo basal la app dejaría de ser una herramienta y pasaría
 * a ser el instrumento de algo peor. Cuando el déficit pedido cae ahí, se
 * aplica el suelo y se DICE (`floored`) en vez de devolver el número bajo en
 * silencio.
 */
export function dailyTargets(p: BodyProfileLike, todayISO: string): DailyTargets {
  const bmr = basalMetabolicRate(p, todayISO);
  const suelo = Math.max(bmr, SUELO_DURO[p.sex]);
  const pedido = totalEnergyExpenditure(p, todayISO) + GOAL_DELTA_KCAL[p.goal];

  const kcal = p.kcalOverride ?? Math.max(pedido, suelo);
  const floored = p.kcalOverride === null && pedido < suelo;

  const proteinG = redondea(p.proteinGPerKg * p.weightKg);
  const fatG = redondea(((p.fatPct / 100) * kcal) / 9);
  const restante = kcal - 4 * proteinG - 9 * fatG;

  return {
    kcal,
    proteinG,
    fatG,
    // Nunca negativo: un objetivo de −30 g de carbohidratos no significa nada.
    carbsG: Math.max(0, redondea(restante / 4)),
    source: p.kcalOverride === null ? "perfil" : "override",
    floored,
    impossibleSplit: restante < 0
  };
}

/**
 * Los macros de una cantidad concreta, desde los valores por 100 g.
 *
 * **Redondea una sola vez, al final.** Redondear el valor por gramo y después
 * multiplicar deriva varias kcal por línea y decenas por día: 14 g de aceite
 * son 124 kcal, no las 126 que salen de redondear 8,84 a 9.
 */
export function scalePer100g(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: redondea(per100g.kcal * f),
    proteinG: unDecimal(per100g.proteinG * f),
    carbsG: unDecimal(per100g.carbsG * f),
    fatG: unDecimal(per100g.fatG * f)
  };
}

export function sumMacros(items: readonly Macros[]): Macros {
  return items.reduce<Macros>(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      proteinG: unDecimal(acc.proteinG + m.proteinG),
      carbsG: unDecimal(acc.carbsG + m.carbsG),
      fatG: unDecimal(acc.fatG + m.fatG)
    }),
    { ...ZERO_MACROS }
  );
}

/**
 * Los totales de cada comida. **Devuelve siempre las cuatro**, incluidas las
 * que están a cero: la pantalla tiene que poder pintar «Cena — 0 kcal» y no
 * omitir la tarjeta, que es lo que invita a registrarla.
 */
export function macrosByMeal(entries: readonly (Macros & { meal: Meal })[]): Record<Meal, Macros> {
  const salida = Object.fromEntries(MEALS.map((m) => [m, { ...ZERO_MACROS }])) as Record<Meal, Macros>;
  for (const e of entries) {
    salida[e.meal] = sumMacros([salida[e.meal], e]);
  }
  return salida;
}

/**
 * El reparto en porcentaje. **Suma exactamente 100**: el resto del redondeo se
 * le da al macro mayor, porque tres cifras que suman 99 en una etiqueta se leen
 * como un error de la app.
 */
export function macroSplitPct(m: Macros): { protein: number; carbs: number; fat: number } {
  const total = 4 * m.proteinG + 4 * m.carbsG + 9 * m.fatG;
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 };

  const crudos = { protein: (4 * m.proteinG) / total, carbs: (4 * m.carbsG) / total, fat: (9 * m.fatG) / total };
  const salida = { protein: redondea(crudos.protein * 100), carbs: redondea(crudos.carbs * 100), fat: redondea(crudos.fat * 100) };

  const sobra = 100 - (salida.protein + salida.carbs + salida.fat);
  if (sobra !== 0) {
    const mayor = (["protein", "carbs", "fat"] as const).reduce((a, b) => (crudos[a] >= crudos[b] ? a : b));
    salida[mayor] += sobra;
  }
  return salida;
}

export interface MacroProgress {
  current: number;
  target: number;
  pct: number;
  remaining: number;
  over: boolean;
}

/**
 * Cuánto llevas de cada objetivo. **`pct` puede pasar de 100 y `over` lo
 * señala**: recortarlo en silencio escondería justo el día que hay que ver.
 */
export function targetProgress(consumed: Macros, targets: DailyTargets): Record<keyof Macros, MacroProgress> {
  const una = (current: number, target: number): MacroProgress => ({
    current,
    target,
    pct: target > 0 ? redondea((current / target) * 100) : 0,
    remaining: unDecimal(Math.max(0, target - current)),
    over: current > target
  });
  return {
    kcal: una(consumed.kcal, targets.kcal),
    proteinG: una(consumed.proteinG, targets.proteinG),
    carbsG: una(consumed.carbsG, targets.carbsG),
    fatG: una(consumed.fatG, targets.fatG)
  };
}

export interface LoggedDay {
  /** ISO date. */
  date: string;
  total: Macros;
  entryCount: number;
}

/**
 * ¿Cerró el día dentro de la banda?
 *
 * **Un día sin registros NO cumple.** No es un día perfecto: es un día sin
 * registrar, y contarlo como cumplido convertiría el abandono en adherencia
 * perfecta.
 */
export function dayMeetsTarget(day: LoggedDay, targets: DailyTargets): boolean {
  if (day.entryCount <= 0) return false;
  return Math.abs(day.total.kcal - targets.kcal) <= targets.kcal * KCAL_BAND;
}

/** Días de una ventana, con los dos extremos incluidos. */
function diasEntre(desdeISO: string, hastaISO: string): number {
  const d = diffDays(desdeISO, hastaISO);
  return Number.isFinite(d) ? d + 1 : 0;
}

/**
 * % de días de la ventana cerrados dentro de la banda.
 *
 * **Los días sin registro cuentan en el denominador.** Si no, quien registrara
 * un único día perfecto vería un 100 % de adherencia — y ese número acabaría
 * en un resultado clave.
 */
export function nutritionAdherencePct(
  days: readonly LoggedDay[],
  targets: DailyTargets,
  fromISO: string,
  toISO: string
): number {
  const total = diasEntre(fromISO, toISO);
  if (total <= 0) return 0;
  const dentro = days.filter((d) => d.date >= fromISO && d.date <= toISO && dayMeetsTarget(d, targets)).length;
  return redondea((dentro / total) * 100);
}

/**
 * Días seguidos con al menos un registro.
 *
 * **Se corta con un día vacío, no con un día flojo**: esto mide el hábito de
 * registrar, no el de comer bien. Y si hoy aún no hay nada, la racha se cuenta
 * desde ayer: el día no ha terminado y romperla a media tarde sería mentir.
 */
export function loggingStreak(days: readonly LoggedDay[], todayISO: string): number {
  const conRegistro = new Set(days.filter((d) => d.entryCount > 0).map((d) => d.date));
  let cursor = conRegistro.has(todayISO) ? todayISO : addDaysISO(todayISO, -1);
  let racha = 0;
  while (conRegistro.has(cursor)) {
    racha += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return racha;
}

export interface Measurement {
  /** ISO date. */
  localDate: string;
  weightKg: number;
}

export function latestWeight(mediciones: readonly Measurement[]): number | null {
  let ultima: Measurement | null = null;
  for (const m of mediciones) {
    if (!ultima || m.localDate > ultima.localDate) ultima = m;
  }
  return ultima ? ultima.weightKg : null;
}

export interface WeightTrend {
  actual: number;
  /** Negativo = bajando. */
  delta: number;
  dias: number;
}

/** Cuántas mediciones se promedian en cada extremo de la tendencia. */
const VENTANA_TENDENCIA = 3;

/**
 * La tendencia del peso en una ventana.
 *
 * **Promedia los extremos en ventanas de tres días en vez de restar dos
 * básculas.** El peso diario oscila un par de kilos por agua y sal; una
 * tendencia hecha de dos puntos dice lo que digan esos dos días, y puede
 * afirmar que subiste la semana en que bajaste.
 */
export function weightTrend(mediciones: readonly Measurement[], desdeISO: string, hastaISO: string): WeightTrend | null {
  const ventana = mediciones
    .filter((m) => m.localDate >= desdeISO && m.localDate <= hastaISO)
    .sort((a, b) => (a.localDate < b.localDate ? -1 : 1));

  const primera = ventana[0];
  const ultima = ventana[ventana.length - 1];
  if (!primera || !ultima) return null;

  const media = (xs: Measurement[]) => xs.reduce((s, m) => s + m.weightKg, 0) / xs.length;

  return {
    actual: ultima.weightKg,
    delta: unDecimal(media(ventana.slice(-VENTANA_TENDENCIA)) - media(ventana.slice(0, VENTANA_TENDENCIA))),
    dias: diasEntre(primera.localDate, ultima.localDate)
  };
}
