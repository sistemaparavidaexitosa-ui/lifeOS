// tests/domain/centro-componer.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { componerCentro } from "../../src/lib/domain/centro/componer.ts";
import { POLITICA_POR_DEFECTO } from "../../src/lib/domain/ritual/policy.ts";
import type { EntradaSecuencia, RutinaDelRitual } from "../../src/lib/domain/ritual/secuencia.ts";
import type { RitualSettings } from "../../src/lib/domain/ritual/types.ts";

// El centro no es la secuencia: es una pantalla. Pero hereda de ella la regla
// de la hora y la de «ningún bloque sin su dato» (D-165), porque se compone
// llamando a `construirSecuencia`.

const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function habito(id: string, position: number, registradoHoy = false) {
  return { id, name: `Hábito ${id}`, position, durationMin: 5, cue: "", twoMinVersion: "", registradoHoy };
}

function rutina(r: Partial<RutinaDelRitual> = {}): RutinaDelRitual {
  return { id: "r1", name: "Mañana", due: true, active: true, position: 0, bloque: null, habits: [habito("h1", 0)], ...r };
}

function ajustes(p: Partial<RitualSettings> = {}): RitualSettings {
  return { ...POLITICA_POR_DEFECTO, enabled: true, ...p };
}

function entrada(e: Partial<EntradaSecuencia> = {}): EntradaSecuencia {
  return {
    settings: ajustes(),
    nombre: "Luis",
    dateISO: "2026-09-23",
    hourLocal: 9,
    ahoraMin: min("09:00"),
    brief: null,
    rutinas: [rutina()],
    contexto: [{ id: "liquidez", etiqueta: "Disponible", valor: 100, unidad: "moneda", tono: "info" }],
    plan: { oneThing: "Cerrar la propuesta", tareas: [{ id: "t1", title: "Revisar" }] },
    ...e
  };
}

const kinds = (e: EntradaSecuencia) => componerCentro(e).map((b) => b.kind);

test("Con todo, el centro tiene ahora, día y lo que mueve el día", () => {
  assert.deepStrictEqual(kinds(entrada()), ["ahora", "dia", "mueve"]);
});

test("Solo UN hábito en «ahora»: el centro no es la pantalla de rutinas", () => {
  const larga = rutina({ habits: [habito("h1", 0), habito("h2", 1), habito("h3", 2)] });
  assert.strictEqual(componerCentro(entrada({ rutinas: [larga] })).filter((b) => b.kind === "ahora").length, 1);
});

test("Sin hábitos pendientes no hay bloque «ahora»", () => {
  const hecha = rutina({ habits: [habito("h1", 0, true)] });
  assert.ok(!kinds(entrada({ rutinas: [hecha] })).includes("ahora"));
});

test("Hereda la regla de la hora: la rutina de la noche no sale a las nueve", () => {
  const noche = rutina({ bloque: { inicioMin: min("20:30"), finMin: min("21:00") } });
  assert.ok(!kinds(entrada({ rutinas: [noche], ahoraMin: min("09:00") })).includes("ahora"));
});

test("Sin hechos no hay bloque del día", () => {
  assert.ok(!kinds(entrada({ contexto: [] })).includes("dia"));
});

test("Sin Única Cosa no hay «lo que mueve el día», aunque haya tareas", () => {
  assert.ok(!kinds(entrada({ plan: { oneThing: null, tareas: [{ id: "t", title: "T" }] } })).includes("mueve"));
});

test("Un día vacío compone cero bloques, y el centro sigue sirviendo para navegar", () => {
  assert.deepStrictEqual(kinds(entrada({ rutinas: [], contexto: [], plan: null })), []);
});

test("La política de pasos del administrador NO recorta el centro", () => {
  // El centro no es el ritual: que el admin apague el paso de contexto en la
  // secuencia no puede dejar sin cifras la pantalla de navegación.
  const sinContexto = ajustes({ steps: ["greeting"] });
  assert.deepStrictEqual(kinds(entrada({ settings: sinContexto })), ["ahora", "dia", "mueve"]);
});

test("El bloque «ahora» lleva la rutina, para poder marcar el hábito", () => {
  const [bloque] = componerCentro(entrada());
  assert.strictEqual(bloque?.kind, "ahora");
  assert.strictEqual(bloque.kind === "ahora" && bloque.paso.routineId, "r1");
  assert.strictEqual(bloque.kind === "ahora" && bloque.paso.habit.id, "h1");
});
