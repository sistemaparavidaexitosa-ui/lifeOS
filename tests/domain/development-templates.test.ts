// tests/domain/development-templates.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROUTINE_TEMPLATES,
  HABIT_TEMPLATES,
  routineTemplateDuration,
  getRoutineTemplate,
  getHabitTemplate,
  habitTemplatesByCategory,
  matchHabitForStep
} from "../../src/lib/domain/development/templates.ts";

test("los ids de las plantillas son únicos", () => {
  // Un id repetido haría que "usar plantilla" copiara siempre la primera, y el
  // síntoma sería que una de las dos no se puede elegir nunca.
  const rutinas = ROUTINE_TEMPLATES.map((t) => t.id);
  const habitos = HABIT_TEMPLATES.map((t) => t.id);
  assert.strictEqual(new Set(rutinas).size, rutinas.length);
  assert.strictEqual(new Set(habitos).size, habitos.length);
});

test("cada plantilla de rutina tiene pasos, y todos con duración positiva", () => {
  for (const plantilla of ROUTINE_TEMPLATES) {
    assert.ok(plantilla.steps.length > 0, `${plantilla.id} sin pasos`);
    for (const paso of plantilla.steps) {
      assert.ok(paso.durationMin > 0, `${plantilla.id}: "${paso.title}" dura ${paso.durationMin}`);
      assert.ok(paso.title.trim().length > 0);
      assert.ok(paso.detail.trim().length > 0, `${plantilla.id}: "${paso.title}" sin descripción`);
    }
  }
});

test("las duraciones suman lo que la plantilla promete", () => {
  // Es el error que solo se ve contando: una plantilla que se llama "de 60
  // minutos" y suma 55 nadie la revisa a mano.
  assert.strictEqual(routineTemplateDuration(getRoutineTemplate("savers-60")!), 60);
  assert.strictEqual(routineTemplateDuration(getRoutineTemplate("savers-6")!), 6);
  assert.strictEqual(routineTemplateDuration(getRoutineTemplate("club-5am")!), 60);
});

test("S.A.V.E.R.S. son seis pasos y la versión corta tiene los mismos", () => {
  const largo = getRoutineTemplate("savers-60")!;
  const corto = getRoutineTemplate("savers-6")!;
  assert.strictEqual(largo.steps.length, 6);
  assert.deepStrictEqual(
    corto.steps.map((s) => s.title),
    largo.steps.map((s) => s.title)
  );
});

test("la fórmula 20/20/20 son tres bloques de veinte", () => {
  const club = getRoutineTemplate("club-5am")!;
  assert.deepStrictEqual(
    club.steps.map((s) => s.durationMin),
    [20, 20, 20]
  );
});

test("toda plantilla de rutina declara su fuente", () => {
  // La atribución se pinta en la interfaz; si falta, la plantilla aparece como
  // si el marco fuera nuestro.
  for (const plantilla of ROUTINE_TEMPLATES) {
    assert.ok(plantilla.source.trim().length > 0, `${plantilla.id} sin fuente`);
  }
});

test("cada plantilla de hábito trae señal y versión de dos minutos", () => {
  // Sin esas dos, la plantilla es una lista de nombres bonitos: justo lo que
  // se decidió NO construir.
  for (const plantilla of HABIT_TEMPLATES) {
    assert.ok(plantilla.cue.trim().length > 0, `${plantilla.id} sin señal`);
    assert.ok(plantilla.twoMinVersion.trim().length > 0, `${plantilla.id} sin versión de dos minutos`);
    assert.ok(plantilla.why.trim().length > 0, `${plantilla.id} sin explicación`);
  }
});

test("las señales están redactadas como intención de implementación", () => {
  // «Después de X» es la forma del libro. Una señal que no dice DESPUÉS DE QUÉ
  // es un recordatorio, no un disparador.
  for (const plantilla of HABIT_TEMPLATES) {
    assert.ok(
      plantilla.cue.toLowerCase().startsWith("después de"),
      `${plantilla.id}: la señal "${plantilla.cue}" no dice después de qué`
    );
  }
});

test("habitTemplatesByCategory agrupa sin perder ni duplicar plantillas", () => {
  const grupos = habitTemplatesByCategory();
  const total = grupos.reduce((sum, g) => sum + g.templates.length, 0);
  assert.strictEqual(total, HABIT_TEMPLATES.length);
  assert.ok(grupos.every((g) => g.templates.length > 0), "no debe haber grupos vacíos");
});

test("getHabitTemplate y getRoutineTemplate devuelven undefined para un id inventado", () => {
  assert.strictEqual(getHabitTemplate("no-existe"), undefined);
  assert.strictEqual(getRoutineTemplate("no-existe"), undefined);
});

test("matchHabitForStep reconoce el hábito aunque el nombre no sea idéntico", () => {
  const habitos = [
    { id: "h1", name: "Leer 20 min antes de dormir" },
    { id: "h2", name: "Correr" }
  ];
  assert.strictEqual(matchHabitForStep("leer", habitos), "h1");
});

test("matchHabitForStep ignora acentos y mayúsculas", () => {
  const habitos = [{ id: "h9", name: "Meditación matutina" }];
  assert.strictEqual(matchHabitForStep("meditacion", habitos), "h9");
});

test("matchHabitForStep devuelve null cuando no hay pista o no hay coincidencia", () => {
  // No encontrar nada es el caso BUENO desde 0045: el paso se siembra como
  // hábito nuevo de la rutina. Lo que sí cuesta es encontrar de más, porque
  // entonces el paso no se siembra y la rutina nace incompleta — por eso un
  // paso sin `habitHint` nunca busca, en vez de comparar por su título.
  assert.strictEqual(matchHabitForStep(undefined, [{ id: "h1", name: "Leer" }]), null);
  assert.strictEqual(matchHabitForStep("nadar", [{ id: "h1", name: "Leer" }]), null);
  assert.strictEqual(matchHabitForStep("leer", []), null);
});

test("HabitTemplate ya no lleva frecuencia: la dicta la rutina", () => {
  // Desde 0045 un hábito no vive suelto: siempre está dentro de una rutina, y
  // es ella la que tiene frecuencia. Una plantilla de hábito con `frequency`
  // propondría un valor que el formulario ya no tiene dónde guardar.
  for (const plantilla of HABIT_TEMPLATES) {
    assert.ok(!Object.hasOwn(plantilla, "frequency"), `${plantilla.id} todavía trae frequency`);
  }
});

test("si el usuario ya tiene todos los hábitos de una plantilla de rutina, ningún paso queda por sembrar", () => {
  // Reproduce el filtro que usa `createRoutineFromTemplate` (fuera del alcance
  // de este archivo por ser una server action, no lógica pura): si el usuario
  // ya tiene un hábito que coincide con cada paso, la lista de "nuevos" sale
  // vacía. Ese caso es justo el que la acción debe rechazar en vez de crear
  // una rutina sin hábitos que reporte éxito.
  //
  // Se usa el Club de las 5 AM y no S.A.V.E.R.S. porque es la única plantilla
  // en la que TODOS los pasos traen `habitHint`, que desde ahora es lo único
  // que se compara.
  const plantilla = getRoutineTemplate("club-5am")!;
  const existentes = plantilla.steps.map((paso, i) => ({ id: `h${i}`, name: paso.habitHint! }));
  const nuevos = plantilla.steps.filter((paso) => matchHabitForStep(paso.habitHint, existentes) === null);
  assert.strictEqual(nuevos.length, 0);
});

test("un paso sin habitHint se siembra siempre, aunque su título se parezca a un hábito que ya llevas", () => {
  // La regresión que esta prueba fija: comparar por `step.title` hacía que
  // "Silencio" o "Escritura" coincidieran por inclusión con hábitos del
  // usuario y la rutina naciera con la mitad de los pasos, en silencio. Un
  // paso sin pista NO es candidato a duplicado; se siembra.
  const plantilla = getRoutineTemplate("savers-60")!;
  const sinPista = plantilla.steps.filter((paso) => paso.habitHint === undefined);
  assert.ok(sinPista.length > 0, "la plantilla ya no tiene pasos sin habitHint: revisa esta prueba");

  const existentes = sinPista.map((paso, i) => ({ id: `h${i}`, name: paso.title }));
  for (const paso of sinPista) {
    assert.strictEqual(matchHabitForStep(paso.habitHint, existentes), null);
  }
});
