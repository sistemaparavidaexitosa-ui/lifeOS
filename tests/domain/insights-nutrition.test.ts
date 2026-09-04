import { test } from "node:test";
import assert from "node:assert/strict";
import { nutritionFacts, type NutritionSnapshot } from "../../src/lib/domain/insights/facts/nutrition.ts";
import { dailyTargets, type BodyProfileLike } from "../../src/lib/domain/development/nutrition.ts";

const PERFIL: BodyProfileLike = {
  sex: "Hombre",
  birthDate: "1996-09-03",
  heightCm: 180,
  weightKg: 82,
  activityLevel: "Moderado",
  goal: "Mantener",
  proteinGPerKg: 1.6,
  fatPct: 25,
  kcalOverride: null
};

const OBJETIVOS = dailyTargets(PERFIL, "2026-09-03");

function dia(date: string, kcal: number, proteinG = 130) {
  return { date, total: { kcal, proteinG, carbsG: 0, fatG: 0 }, entryCount: 3 };
}

/** N días seguidos terminando en `hasta`, todos con registro. */
function racha(hasta: string, n: number, kcal = OBJETIVOS.kcal) {
  const salida = [];
  const d = new Date(`${hasta}T00:00:00Z`);
  for (let i = 0; i < n; i += 1) {
    salida.push(dia(d.toISOString().slice(0, 10), kcal));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return salida;
}

const VACIO: NutritionSnapshot = { profile: null, days: [], measurements: [] };

test("nutritionFacts: sin perfil y sin diario no inventa nada", () => {
  assert.deepStrictEqual(nutritionFacts(VACIO, "2026-09-03"), []);
});

test("nutritionFacts: hay diario pero no hay perfil — lo dice, porque no hay contra qué medir", () => {
  const facts = nutritionFacts({ ...VACIO, days: racha("2026-09-03", 8) }, "2026-09-03");
  const f = facts.find((x) => x.id === "nutrition.no-profile");
  assert.ok(f, "debería avisar de que falta el perfil corporal");
  assert.ok(f.weight <= 0.4, "un hecho descriptivo no puede desplazar a una racha rota");
});

test("nutritionFacts: una racha de registro que se cortó pesa mucho", () => {
  // 21 días seguidos hasta el 2026-08-28, y desde entonces nada.
  const facts = nutritionFacts({ profile: PERFIL, days: racha("2026-08-28", 21), measurements: [] }, "2026-09-03");
  const f = facts.find((x) => x.id === "nutrition.logging-dropped");
  assert.ok(f, "debería detectar el abandono del diario");
  assert.ok(f.weight > 0.4);
});

test("nutritionFacts: ningún hecho nombra un alimento — solo agregados", () => {
  // 3600 kcal contra un objetivo de ~2790: un desvío que sí produce hechos.
  const facts = nutritionFacts({ profile: PERFIL, days: racha("2026-09-03", 20, 3600), measurements: [] }, "2026-09-03");
  assert.ok(facts.length > 0);
  for (const f of facts) {
    assert.doesNotMatch(f.label, /dona|pizza|cerveza|helado/i, `un hecho nombró un alimento: ${f.label}`);
  }
});

test("nutritionFacts: comer POR DEBAJO del objetivo también es un desvío, no un logro", () => {
  const bajo = nutritionFacts({ profile: PERFIL, days: racha("2026-09-03", 14, 1600), measurements: [] }, "2026-09-03");
  const f = bajo.find((x) => x.id === "nutrition.kcal-drift");
  assert.ok(f, "un déficit sostenido tiene que reportarse igual que un exceso");
});

test("nutritionFacts: la tendencia de peso se reporta cuando hay mediciones suficientes", () => {
  const measurements = [
    { localDate: "2026-08-05", weightKg: 84 },
    { localDate: "2026-08-06", weightKg: 83.9 },
    { localDate: "2026-08-07", weightKg: 84.1 },
    { localDate: "2026-09-01", weightKg: 82.3 },
    { localDate: "2026-09-02", weightKg: 82.1 },
    { localDate: "2026-09-03", weightKg: 82.0 }
  ];
  const facts = nutritionFacts({ profile: PERFIL, days: racha("2026-09-03", 20), measurements }, "2026-09-03");
  const f = facts.find((x) => x.id === "nutrition.weight-trend");
  assert.ok(f);
  assert.match(f.label, /kg/);
});

test("nutritionFacts: todos los hechos van en el dominio nutrition y con peso entre 0 y 1", () => {
  const facts = nutritionFacts({ profile: PERFIL, days: racha("2026-09-03", 20, 3600), measurements: [] }, "2026-09-03");
  for (const f of facts) {
    assert.strictEqual(f.domain, "nutrition");
    assert.ok(f.weight >= 0 && f.weight <= 1, `${f.id} tiene peso ${f.weight}`);
  }
});
