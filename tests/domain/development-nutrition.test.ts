import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageOn,
  basalMetabolicRate,
  dailyTargets,
  dayMeetsTarget,
  latestWeight,
  loggingStreak,
  macroSplitPct,
  macrosByMeal,
  nutritionAdherencePct,
  scalePer100g,
  sumMacros,
  targetProgress,
  totalEnergyExpenditure,
  weightTrend,
  MEALS,
  type BodyProfileLike
} from "../../src/lib/domain/development/nutrition.ts";

// 2026-09-03 es jueves. Todas las fechas de corte entran como parámetro: aquí
// no se llama nunca a new Date() (D-016/D-018).

const HOMBRE: BodyProfileLike = {
  sex: "Hombre",
  birthDate: "1996-09-03",
  heightCm: 180,
  weightKg: 80,
  activityLevel: "Moderado",
  goal: "Mantener",
  proteinGPerKg: 1.6,
  fatPct: 25,
  kcalOverride: null
};

test("ageOn: el año sube el día del cumpleaños, no el anterior", () => {
  assert.strictEqual(ageOn("1996-09-03", "2026-09-02"), 29);
  assert.strictEqual(ageOn("1996-09-03", "2026-09-03"), 30);
});

test("basalMetabolicRate: Mifflin-St Jeor, caso contrastable (hombre 80 kg / 180 cm / 30 a)", () => {
  assert.strictEqual(basalMetabolicRate(HOMBRE, "2026-09-03"), 1780);
});

test("basalMetabolicRate: la constante de mujer es −161, no la misma fórmula", () => {
  assert.strictEqual(basalMetabolicRate({ ...HOMBRE, sex: "Mujer" }, "2026-09-03"), 1614);
});

test("totalEnergyExpenditure: los cinco niveles tienen factor y ninguno cae en undefined", () => {
  for (const nivel of ["Sedentario", "Ligero", "Moderado", "Alto", "Muy alto"] as const) {
    const t = totalEnergyExpenditure({ ...HOMBRE, activityLevel: nivel }, "2026-09-03");
    assert.ok(Number.isFinite(t) && t > 0, `${nivel} no da un gasto válido`);
  }
});

test("dailyTargets: 'Perder' resta 500 kcal al gasto total", () => {
  const mantener = dailyTargets(HOMBRE, "2026-09-03");
  const perder = dailyTargets({ ...HOMBRE, goal: "Perder" }, "2026-09-03");
  assert.strictEqual(mantener.kcal - perder.kcal, 500);
});

test("dailyTargets: nunca propone por debajo del metabolismo basal, y lo marca en floored", () => {
  const t = dailyTargets({ ...HOMBRE, activityLevel: "Sedentario", goal: "Perder" }, "2026-09-03");
  assert.strictEqual(t.kcal, 1780);
  assert.strictEqual(t.floored, true);
});

test("dailyTargets: existe además un suelo duro por sexo, por debajo del basal", () => {
  const menuda: BodyProfileLike = {
    ...HOMBRE,
    sex: "Mujer",
    weightKg: 50,
    heightCm: 155,
    activityLevel: "Sedentario",
    goal: "Perder"
  };
  const t = dailyTargets(menuda, "2026-09-03");
  assert.strictEqual(t.kcal, 1200);
  assert.strictEqual(t.floored, true);
});

test("dailyTargets: kcalOverride manda sobre el cálculo y lo declara en source", () => {
  const t = dailyTargets({ ...HOMBRE, kcalOverride: 2400 }, "2026-09-03");
  assert.strictEqual(t.kcal, 2400);
  assert.strictEqual(t.source, "override");
  assert.strictEqual(dailyTargets(HOMBRE, "2026-09-03").source, "perfil");
});

test("dailyTargets: los macros suman las kcal del objetivo con ±2 de holgura de redondeo", () => {
  const t = dailyTargets(HOMBRE, "2026-09-03");
  const suma = 4 * t.proteinG + 4 * t.carbsG + 9 * t.fatG;
  assert.ok(Math.abs(suma - t.kcal) <= 2, `los macros suman ${suma} contra un objetivo de ${t.kcal}`);
});

test("dailyTargets: un reparto imposible deja carbohidratos en 0 y lo marca, nunca en negativo", () => {
  const t = dailyTargets({ ...HOMBRE, weightKg: 200, proteinGPerKg: 3, fatPct: 45, kcalOverride: 1000 }, "2026-09-03");
  assert.strictEqual(t.carbsG, 0);
  assert.strictEqual(t.impossibleSplit, true);
});

test("scalePer100g: 150 g de un alimento de 100 kcal/100 g son 150 kcal", () => {
  const m = scalePer100g({ kcal: 100, proteinG: 10, carbsG: 20, fatG: 5 }, 150);
  assert.strictEqual(m.kcal, 150);
  assert.strictEqual(m.proteinG, 15);
});

test("scalePer100g: redondea UNA sola vez, al final — 14 g de aceite son 124 kcal, no 126", () => {
  const m = scalePer100g({ kcal: 884, proteinG: 0, carbsG: 0, fatG: 100 }, 14);
  assert.strictEqual(m.kcal, 124);
});

test("scalePer100g: 0 g devuelve ceros y no NaN", () => {
  assert.deepStrictEqual(scalePer100g({ kcal: 100, proteinG: 10, carbsG: 20, fatG: 5 }, 0), {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0
  });
});

test("sumMacros: la lista vacía devuelve ceros y no NaN", () => {
  assert.deepStrictEqual(sumMacros([]), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
});

test("macrosByMeal: devuelve SIEMPRE las cuatro comidas, incluidas las que están a cero", () => {
  const porComida = macrosByMeal([{ meal: "Desayuno", kcal: 300, proteinG: 20, carbsG: 30, fatG: 10 }]);
  assert.deepStrictEqual(Object.keys(porComida).sort(), [...MEALS].sort());
  assert.strictEqual(porComida.Cena.kcal, 0);
  assert.strictEqual(porComida.Desayuno.kcal, 300);
});

test("macroSplitPct: suma exactamente 100 aunque el redondeo empuje", () => {
  const s = macroSplitPct({ kcal: 2000, proteinG: 128, carbsG: 246, fatG: 56 });
  assert.strictEqual(s.protein + s.carbs + s.fat, 100);
});

test("targetProgress: pasarse marca over y no recorta el porcentaje a 100 en silencio", () => {
  const t = dailyTargets(HOMBRE, "2026-09-03");
  const p = targetProgress({ kcal: t.kcal * 2, proteinG: 0, carbsG: 0, fatG: 0 }, t);
  assert.strictEqual(p.kcal.over, true);
  assert.ok(p.kcal.pct > 100);
});

test("targetProgress: un objetivo en 0 devuelve 0 % y no divide por cero", () => {
  const t = { ...dailyTargets(HOMBRE, "2026-09-03"), proteinG: 0 };
  const p = targetProgress({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, t);
  assert.strictEqual(p.proteinG.pct, 0);
});

test("dayMeetsTarget: un día SIN registros no cumple — no es un día perfecto, es un día sin registrar", () => {
  const t = dailyTargets(HOMBRE, "2026-09-03");
  const vacio = { date: "2026-09-03", total: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, entryCount: 0 };
  assert.strictEqual(dayMeetsTarget(vacio, t), false);
});

test("dayMeetsTarget: quedarse un 20 % POR DEBAJO tampoco cumple — la banda es simétrica", () => {
  const t = dailyTargets(HOMBRE, "2026-09-03");
  const corto = { date: "2026-09-03", total: { kcal: Math.round(t.kcal * 0.8), proteinG: 0, carbsG: 0, fatG: 0 }, entryCount: 4 };
  assert.strictEqual(dayMeetsTarget(corto, t), false);
  const dentro = { date: "2026-09-03", total: { kcal: t.kcal, proteinG: 0, carbsG: 0, fatG: 0 }, entryCount: 4 };
  assert.strictEqual(dayMeetsTarget(dentro, t), true);
});

test("nutritionAdherencePct: los días SIN registro cuentan en el denominador", () => {
  const t = dailyTargets(HOMBRE, "2026-09-03");
  const dias = [{ date: "2026-09-03", total: { kcal: t.kcal, proteinG: 0, carbsG: 0, fatG: 0 }, entryCount: 3 }];
  // Un solo día perfecto dentro de una ventana de diez no es un 100 %.
  assert.strictEqual(nutritionAdherencePct(dias, t, "2026-08-25", "2026-09-03"), 10);
});

test("nutritionAdherencePct: un rango vacío devuelve 0 y no NaN", () => {
  const t = dailyTargets(HOMBRE, "2026-09-03");
  assert.strictEqual(nutritionAdherencePct([], t, "2026-09-03", "2026-09-01"), 0);
});

test("loggingStreak: se corta con un día SIN entradas, no con un día flojo", () => {
  const dia = (date: string, entryCount: number) => ({ date, total: { kcal: 100, proteinG: 0, carbsG: 0, fatG: 0 }, entryCount });
  assert.strictEqual(loggingStreak([dia("2026-09-03", 1), dia("2026-09-02", 5), dia("2026-09-01", 1)], "2026-09-03"), 3);
  assert.strictEqual(loggingStreak([dia("2026-09-03", 1), dia("2026-09-01", 1)], "2026-09-03"), 1);
});

test("loggingStreak: no registrar todavía HOY no rompe la racha de ayer — el día no ha terminado", () => {
  const dia = (date: string) => ({ date, total: { kcal: 100, proteinG: 0, carbsG: 0, fatG: 0 }, entryCount: 2 });
  assert.strictEqual(loggingStreak([dia("2026-09-02"), dia("2026-09-01")], "2026-09-03"), 2);
});

test("latestWeight: devuelve la medición más reciente, no la primera de la lista", () => {
  const m = [
    { localDate: "2026-08-01", weightKg: 84 },
    { localDate: "2026-09-02", weightKg: 82.4 }
  ];
  assert.strictEqual(latestWeight(m), 82.4);
  assert.strictEqual(latestWeight([]), null);
});

test("weightTrend: promedia los extremos en ventanas de 3 días, no resta dos básculas sueltas", () => {
  // El 2026-09-01 marca un pico de agua de +2 kg. Restando extremos daría +1,4;
  // con ventanas de tres, la tendencia real es de bajada.
  const m = [
    { localDate: "2026-08-01", weightKg: 84 },
    { localDate: "2026-08-02", weightKg: 83.8 },
    { localDate: "2026-08-03", weightKg: 84.2 },
    { localDate: "2026-08-30", weightKg: 82.2 },
    { localDate: "2026-08-31", weightKg: 82.4 },
    { localDate: "2026-09-01", weightKg: 85.4 }
  ];
  const t = weightTrend(m, "2026-08-01", "2026-09-01");
  assert.ok(t);
  assert.ok(t.delta < 0, `la tendencia debería bajar, dio ${t.delta}`);
});

test("weightTrend: sin mediciones no inventa una tendencia", () => {
  assert.strictEqual(weightTrend([], "2026-08-01", "2026-09-01"), null);
});
