// tests/domain/ritual-secuencia.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  construirSecuencia,
  pasoSiguiente,
  progreso,
  hayContenido,
  type EntradaSecuencia,
  type RutinaDelRitual
} from "../../src/lib/domain/ritual/secuencia.ts";
import { POLITICA_POR_DEFECTO } from "../../src/lib/domain/ritual/policy.ts";
import { PASOS_RITUAL, type RitualSettings } from "../../src/lib/domain/ritual/types.ts";

// La secuencia NO sale de una lista fija: cada paso existe si y solo si su dato
// existe (D-165, guardrail NO-MOCK). Eso es lo que se fija aquí.

function ajustes(p: Partial<RitualSettings> = {}): RitualSettings {
  return { ...POLITICA_POR_DEFECTO, enabled: true, steps: [...PASOS_RITUAL], ...p };
}

function habito(id: string, position: number, registradoHoy = false) {
  return { id, name: `Hábito ${id}`, position, durationMin: 5, cue: "", twoMinVersion: "", registradoHoy };
}

function rutina(r: Partial<RutinaDelRitual> = {}): RutinaDelRitual {
  return {
    id: "r1",
    name: "Mañana",
    due: true,
    active: true,
    position: 0,
    bloque: null,
    habits: [habito("h1", 0), habito("h2", 1)],
    ...r
  };
}

const BRIEF_COMPLETO = {
  id: "b1111111-1111-4111-8111-111111111111",
  affirmations: [{ id: "a1", text: "Cumplo lo que me prometo", category: "Disciplina" }],
  mantra: "Hoy elijo la versión de mí que no negocia sus mañanas",
  visualization: { title: "La mañana", durationMin: 5, steps: [{ text: "Respira", seconds: 30 }] },
  dailyAction: { text: "Llama al cliente antes de las 11", done: false }
};

function entrada(e: Partial<EntradaSecuencia> = {}): EntradaSecuencia {
  return {
    settings: ajustes(),
    nombre: "Luis",
    dateISO: "2026-09-23",
    hourLocal: 6,
    ahoraMin: 6 * 60,
    brief: BRIEF_COMPLETO,
    rutinas: [rutina()],
    contexto: [{ id: "liquidez", etiqueta: "Disponible", valor: 100, unidad: "moneda", tono: "info" }],
    plan: { oneThing: "Cerrar la propuesta", tareas: [{ id: "t1", title: "Revisar el contrato" }] },
    ...e
  };
}

function kinds(e: EntradaSecuencia): string[] {
  return construirSecuencia(e).map((p) => p.kind);
}

// ---------------------------------------------------------------------------
// El orden narrativo
// ---------------------------------------------------------------------------

test("Con todo disponible, el orden es el narrativo y lo fija el dominio", () => {
  assert.deepStrictEqual(kinds(entrada()), [
    "greeting",
    "affirmation",
    "mantra",
    "visualization",
    "dailyAction",
    "routineStep",
    "routineStep",
    "context",
    "planToday",
    "closing"
  ]);
});

test("El saludo usa greetingFor, que ya existía, y no un saludo propio", () => {
  const [saludo] = construirSecuencia(entrada({ hourLocal: 6 }));
  assert.strictEqual(saludo?.kind, "greeting");
  assert.strictEqual(saludo.kind === "greeting" && saludo.saludo, "Buenos días");
  assert.strictEqual(saludo.kind === "greeting" && saludo.nombre, "Luis");
});

test("El administrador elige QUÉ pasos, y los demás no aparecen", () => {
  assert.deepStrictEqual(kinds(entrada({ settings: ajustes({ steps: ["greeting", "routineStep"] }) })), [
    "greeting",
    "routineStep",
    "routineStep"
  ]);
});

test("Pedir los pasos en otro orden no cambia el orden narrativo", () => {
  const revuelto = ajustes({ steps: ["planToday", "greeting", "affirmation"] });
  assert.deepStrictEqual(kinds(entrada({ settings: revuelto })), ["greeting", "affirmation", "planToday"]);
});

// ---------------------------------------------------------------------------
// Ningún paso existe si su dato no existe
// ---------------------------------------------------------------------------

test("Sin brief no hay ninguno de los cuatro pasos de identidad", () => {
  assert.deepStrictEqual(kinds(entrada({ brief: null })), ["greeting", "routineStep", "routineStep", "context", "planToday", "closing"]);
});

test("Un brief del respaldo, sin mantra ni acción, no pinta esos dos pasos", () => {
  // `generar.ts` (el respaldo en TypeScript) no escribe mantra ni acción del
  // día. Esos días esos pasos sencillamente no están, y eso es lo correcto.
  const respaldo = { ...BRIEF_COMPLETO, mantra: null, dailyAction: null };
  assert.deepStrictEqual(kinds(entrada({ brief: respaldo })), [
    "greeting",
    "affirmation",
    "visualization",
    "routineStep",
    "routineStep",
    "context",
    "planToday",
    "closing"
  ]);
});

test("Un brief sin afirmaciones no pinta una lista vacía", () => {
  const sinAfirmaciones = { ...BRIEF_COMPLETO, affirmations: [] };
  assert.ok(!kinds(entrada({ brief: sinAfirmaciones })).includes("affirmation"));
});

test("Una visualización sin pasos no se pinta", () => {
  const vacia = { ...BRIEF_COMPLETO, visualization: { title: "x", durationMin: 5, steps: [] } };
  assert.ok(!kinds(entrada({ brief: vacia })).includes("visualization"));
});

test("Sin hechos de contexto no hay paso de contexto", () => {
  assert.ok(!kinds(entrada({ contexto: [] })).includes("context"));
});

test("Sin Única Cosa y sin tareas no hay paso de plan", () => {
  assert.ok(!kinds(entrada({ plan: { oneThing: null, tareas: [] } })).includes("planToday"));
  assert.ok(kinds(entrada({ plan: { oneThing: null, tareas: [{ id: "t", title: "T" }] } })).includes("planToday"));
  assert.ok(kinds(entrada({ plan: { oneThing: "Algo", tareas: [] } })).includes("planToday"));
});

// ---------------------------------------------------------------------------
// Rutinas y hábitos
// ---------------------------------------------------------------------------

test("Un hábito con registro de hoy no genera paso: ya dijiste algo sobre él", () => {
  const r = rutina({ habits: [habito("h1", 0, true), habito("h2", 1, false)] });
  const pasos = construirSecuencia(entrada({ rutinas: [r] })).filter((p) => p.kind === "routineStep");
  assert.strictEqual(pasos.length, 1);
  assert.strictEqual(pasos[0]?.kind === "routineStep" && pasos[0].habit.id, "h2");
});

test("Una rutina que no toca hoy no aporta pasos", () => {
  assert.ok(!kinds(entrada({ rutinas: [rutina({ due: false })] })).includes("routineStep"));
});

test("Una rutina inactiva no aporta pasos", () => {
  assert.ok(!kinds(entrada({ rutinas: [rutina({ active: false })] })).includes("routineStep"));
});

test("El orden es por posición de rutina y luego por posición de hábito", () => {
  const segunda = rutina({ id: "r2", name: "Tarde", position: 1, habits: [habito("h3", 0)] });
  const primera = rutina({ id: "r1", position: 0, habits: [habito("h2", 1), habito("h1", 0)] });
  const pasos = construirSecuencia(entrada({ rutinas: [segunda, primera] })).filter((p) => p.kind === "routineStep");
  assert.deepStrictEqual(
    pasos.map((p) => (p.kind === "routineStep" ? p.habit.id : "")),
    ["h1", "h2", "h3"]
  );
});

test("maxRoutineSteps corta, para que el arranque no sea la pantalla de rutinas", () => {
  const larga = rutina({ habits: [habito("h1", 0), habito("h2", 1), habito("h3", 2), habito("h4", 3)] });
  const pasos = construirSecuencia(entrada({ settings: ajustes({ maxRoutineSteps: 2 }), rutinas: [larga] }));
  assert.strictEqual(pasos.filter((p) => p.kind === "routineStep").length, 2);
});

test("Cada paso de rutina sabe de qué rutina viene, para poder marcarla", () => {
  const [paso] = construirSecuencia(entrada()).filter((p) => p.kind === "routineStep");
  assert.strictEqual(paso?.kind === "routineStep" && paso.routineId, "r1");
  assert.strictEqual(paso?.kind === "routineStep" && paso.routineName, "Mañana");
});

// ---------------------------------------------------------------------------
// hayContenido, pasoSiguiente, progreso
// ---------------------------------------------------------------------------

test("hayContenido: un saludo y un cierre solos NO son un ritual", () => {
  const vacio = entrada({ brief: null, rutinas: [], contexto: [], plan: null });
  assert.deepStrictEqual(kinds(vacio), ["greeting", "closing"]);
  assert.strictEqual(hayContenido(construirSecuencia(vacio)), false);
});

test("hayContenido: con un solo paso real ya lo es", () => {
  const conRutina = entrada({ brief: null, contexto: [], plan: null });
  assert.strictEqual(hayContenido(construirSecuencia(conRutina)), true);
});

test("pasoSiguiente devuelve el índice siguiente, y null al final", () => {
  const pasos = construirSecuencia(entrada());
  assert.strictEqual(pasoSiguiente(pasos, 0), 1);
  assert.strictEqual(pasoSiguiente(pasos, pasos.length - 1), null);
  // Un índice imposible no revienta la pantalla.
  assert.strictEqual(pasoSiguiente(pasos, 999), null);
});

test("progreso cuenta desde uno, que es como lo lee una persona", () => {
  const pasos = construirSecuencia(entrada());
  assert.deepStrictEqual(progreso(pasos, 0), { actual: 1, total: pasos.length, pct: Math.round((1 / pasos.length) * 100) });
  assert.strictEqual(progreso(pasos, pasos.length - 1).pct, 100);
});

test("progreso sobre una secuencia vacía no divide entre cero", () => {
  assert.deepStrictEqual(progreso([], 0), { actual: 0, total: 0, pct: 0 });
});

// ---------------------------------------------------------------------------
// La hora del día decide qué rutina toca AHORA
//
// Una rutina anclada a un bloque de Autogestión del Tiempo tiene su momento. A
// las nueve de la mañana, «Cierre del día» de 20:30 a 21:00 no es el siguiente
// paso de nadie: proponerla en el arranque es tratar el plan de la persona como
// una lista sin horas.
// ---------------------------------------------------------------------------

const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

test("Una rutina cuyo bloque ya terminó hoy no aporta pasos", () => {
  const manana = rutina({ bloque: { inicioMin: min("06:00"), finMin: min("07:00") } });
  assert.ok(!kinds(entrada({ ahoraMin: min("09:00"), rutinas: [manana] })).includes("routineStep"));
});

test("Una rutina que empieza mucho más tarde no aporta pasos al arranque", () => {
  const noche = rutina({ bloque: { inicioMin: min("20:30"), finMin: min("21:00") } });
  assert.ok(!kinds(entrada({ ahoraMin: min("09:00"), rutinas: [noche] })).includes("routineStep"));
});

test("Una rutina en curso sí aporta pasos", () => {
  const ahora = rutina({ bloque: { inicioMin: min("08:30"), finMin: min("09:30") } });
  assert.ok(kinds(entrada({ ahoraMin: min("09:00"), rutinas: [ahora] })).includes("routineStep"));
});

test("Una rutina que empieza pronto, dentro del horizonte, sí aporta pasos", () => {
  const pronto = rutina({ bloque: { inicioMin: min("10:00"), finMin: min("10:30") } });
  assert.ok(kinds(entrada({ ahoraMin: min("09:00"), rutinas: [pronto] })).includes("routineStep"));
});

test("Una rutina sin bloque puede tocar a cualquier hora", () => {
  assert.ok(kinds(entrada({ ahoraMin: min("23:00"), rutinas: [rutina({ bloque: null })] })).includes("routineStep"));
});

test("Primero lo que está en curso, luego lo que no tiene hora, luego lo que viene", () => {
  const viene = rutina({ id: "rv", position: 0, bloque: { inicioMin: min("10:00"), finMin: min("10:30") }, habits: [habito("hv", 0)] });
  const libre = rutina({ id: "rl", position: 1, bloque: null, habits: [habito("hl", 0)] });
  const ahora = rutina({ id: "ra", position: 2, bloque: { inicioMin: min("08:30"), finMin: min("09:30") }, habits: [habito("ha", 0)] });
  const pasos = construirSecuencia(entrada({ ahoraMin: min("09:00"), rutinas: [viene, libre, ahora] })).filter(
    (p) => p.kind === "routineStep"
  );
  assert.deepStrictEqual(
    pasos.map((p) => (p.kind === "routineStep" ? p.habit.id : "")),
    ["ha", "hl", "hv"]
  );
});
