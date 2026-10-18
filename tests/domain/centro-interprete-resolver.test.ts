import { test } from "node:test";
import assert from "node:assert/strict";
import { analizar } from "../../src/lib/domain/centro/interprete/analizar.ts";
import { resolverAnalisis, type ContextoDeResolucion } from "../../src/lib/domain/centro/interprete/resolver.ts";
import { validarCambio } from "../../src/lib/domain/centro/escritura/cambio.ts";
import type { Domain } from "../../src/lib/domain/insights/types.ts";

const H = "2026-10-18";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const N1 = "33333333-3333-4333-8333-333333333333";
const T = (i: number) => `4444444${i}-4444-4444-8444-444444444444`;

function ctx(parcial: Partial<ContextoDeResolucion> = {}): ContextoDeResolucion {
  return {
    autorizados: ["execution", "nutrition"] as Domain[],
    catalogo: { projects: [{ id: P1, nombre: "Rediseño" }], notebooks: [{ id: N1, nombre: "Trabajo" }] },
    candidatos: [],
    alimentos: [],
    hoy: H,
    ...parcial
  };
}

function tarea(i: number, title: string) {
  return { fila: `fila:tasks:${T(i)}`, nombre: title, exacta: false, registro: { id: T(i), title, status: "Pending", priority: "Medium", due: null } };
}

test("Crear tarea con proyecto mencionado: un cambio que pasa validarCambio, título con sus mayúsculas", () => {
  const r = resolverAnalisis(analizar("Crea una tarea llamar a Juan mañana en el proyecto Rediseño, urgente", H), ctx());
  assert.equal(r.tipo, "cambios");
  if (r.tipo !== "cambios") return;
  assert.deepEqual(r.cambios, [
    { operacion: "crear", tabla: "tasks", campos: { project_id: `fila:projects:${P1}`, title: "llamar a Juan", due: "2026-10-19", priority: "High" } }
  ]);
  assert.equal(r.entendi, "Crear la tarea «llamar a Juan» en Rediseño · vence 19 oct · prioridad alta");
  const v = validarCambio(r.cambios[0], { filas: r.filas, autorizados: ["execution"] });
  assert.ok(v.ok, !v.ok ? v.reason : "");
});

test("Crear tarea sin proyecto y con uno solo: ese", () => {
  const r = resolverAnalisis(analizar("crea una tarea «Pagar la luz»", H), ctx());
  assert.equal(r.tipo, "cambios");
  assert.equal(r.tipo === "cambios" && (r.cambios[0] as { campos: Record<string, unknown> }).campos.project_id, `fila:projects:${P1}`);
});

test("Crear tarea sin proyecto y con varios: pregunta en cuál, y cada opción se vuelve a entender sola", () => {
  const c = ctx({ catalogo: { projects: [{ id: P1, nombre: "Rediseño" }, { id: P2, nombre: "Casa" }], notebooks: [] } });
  const r = resolverAnalisis(analizar("crea una tarea pagar la luz", H), c);
  assert.equal(r.tipo, "pregunta");
  if (r.tipo !== "pregunta") return;
  assert.deepEqual(r.opciones.map((o) => o.etiqueta), ["Rediseño", "Casa"]);
  assert.match(r.entendi, /tarea «pagar la luz»/);
  const otra = resolverAnalisis(analizar(r.opciones[1]!.texto, H), c);
  assert.equal(otra.tipo, "cambios");
  assert.equal(otra.tipo === "cambios" && (otra.cambios[0] as { campos: Record<string, unknown> }).campos.project_id, `fila:projects:${P2}`);
});

test("Crear con un proyecto que no existe: nada, y lo dice", () => {
  const r = resolverAnalisis(analizar("crea una tarea pagar en el proyecto Viajes", H), ctx());
  assert.deepEqual(r, { tipo: "nada", entendi: "No encontré ningún proyecto que se llame «viajes»." });
});

test("Crear sin título: a la IA", () => {
  assert.equal(resolverAnalisis(analizar("crea una tarea mañana", H), ctx()).tipo, "ia");
});

test("Dominio apagado: a la IA, aunque se entienda", () => {
  const r = resolverAnalisis(analizar("borra la nota reunión", H), ctx({ autorizados: ["nutrition"] }));
  assert.equal(r.tipo, "ia");
});

test("Comida sin alimento conocido: a la IA (los macros son trabajo de la IA)", () => {
  assert.equal(resolverAnalisis(analizar("desayuné 80 g de avena", H), ctx()).tipo, "ia");
});

test("Comida con alimento del catálogo: macros del catálogo y el día de hoy", () => {
  const r = resolverAnalisis(
    analizar("desayuné 80 g de avena", H),
    ctx({ alimentos: [{ nombre: "Avena", kcal100: 389, protein100: 16.9, carbs100: 66.3, fat100: 6.9 }] })
  );
  assert.equal(r.tipo, "cambios");
  if (r.tipo !== "cambios") return;
  assert.deepEqual(r.cambios[0], {
    operacion: "crear",
    tabla: "food_entries",
    campos: { local_date: H, meal: "Desayuno", name: "Avena", grams: 80, kcal100: 389, protein100: 16.9, carbs100: 66.3, fat100: 6.9 }
  });
  assert.ok(validarCambio(r.cambios[0], { filas: r.filas, autorizados: ["nutrition"] }).ok);
});

test("Editar con una coincidencia: el cambio apunta a esa fila", () => {
  const r = resolverAnalisis(analizar("marca como hecha la tarea llamar a Juan", H), ctx({ candidatos: [tarea(1, "Llamar a Juan")] }));
  assert.equal(r.tipo, "cambios");
  if (r.tipo !== "cambios") return;
  assert.deepEqual(r.cambios, [{ operacion: "editar", fila: `fila:tasks:${T(1)}`, campos: { status: "Completed" } }]);
  assert.equal(r.entendi, "Cambiar la tarea «Llamar a Juan» · estado completada");
  assert.ok(validarCambio(r.cambios[0], { filas: r.filas, autorizados: ["execution"] }).ok);
});

test("Editar con cinco parecidas: pregunta con tres, nunca la primera a ciegas", () => {
  const candidatos = [1, 2, 3, 4, 5].map((i) => tarea(i, `Llamar a Juan ${i}`));
  const r = resolverAnalisis(analizar("marca como hecha la tarea llamar a Juan", H), ctx({ candidatos }));
  assert.equal(r.tipo, "pregunta");
  if (r.tipo !== "pregunta") return;
  assert.equal(r.opciones.length, 3);
  assert.equal(r.opciones[0]!.texto, `marca como hecha la tarea «Llamar a Juan 1» #${T(1)}`);
});

test("Editar: una exacta entre varias parecidas gana", () => {
  const exacta = { ...tarea(2, "Llamar a Juan"), exacta: true };
  const r = resolverAnalisis(analizar("borra la tarea llamar a juan", H), ctx({ candidatos: [tarea(1, "Llamar a Juan hoy"), exacta] }));
  assert.equal(r.tipo, "cambios");
  assert.deepEqual(r.tipo === "cambios" && r.cambios, [{ operacion: "borrar", fila: `fila:tasks:${T(2)}` }]);
  assert.equal(r.tipo === "cambios" && r.entendi, "Borrar la tarea «Llamar a Juan»");
});

test("Editar o borrar sin coincidencias: nada", () => {
  const r = resolverAnalisis(analizar("borra la nota reunión con Ana", H), ctx());
  assert.deepEqual(r, { tipo: "nada", entendi: "No encontré ninguna nota que se llame «reunion con ana»." });
});

test("Editar sin ningún valor que cambiar: a la IA", () => {
  assert.equal(resolverAnalisis(analizar("cambia la tarea llamar a juan", H), ctx({ candidatos: [tarea(1, "Llamar a Juan")] })).tipo, "ia");
});

test("Navegar e IA pasan tal cual", () => {
  assert.deepEqual(resolverAnalisis(analizar("llévame a presupuesto", H), ctx()), { tipo: "navegar", destino: { href: "/money/budget", etiqueta: "Presupuesto" } });
  assert.equal(resolverAnalisis(analizar("¿cómo voy?", H), ctx()).tipo, "ia");
});

test("Crear nota: lo dicho va al cuerpo (obligatorio), y el cambio valida", () => {
  const r = resolverAnalisis(analizar("crea una nota idea para el blog en el cuaderno Trabajo", H), ctx());
  assert.equal(r.tipo, "cambios", r.tipo === "ia" ? r.motivo : "");
  if (r.tipo !== "cambios") return;
  assert.deepEqual(r.cambios, [{ operacion: "crear", tabla: "notes", campos: { notebook_id: `fila:notebooks:${N1}`, body: "idea para el blog" } }]);
  assert.equal(r.entendi, "Crear la nota «idea para el blog» en Trabajo");
});

test("Dos filas con el mismo nombre: las opciones se distinguen y cada una elige SU fila (sin bucle)", () => {
  const c1 = { ...tarea(1, "Llamar a Juan"), exacta: true };
  const c2 = { ...tarea(2, "Llamar a Juan"), exacta: true };
  const r = resolverAnalisis(analizar("borra la tarea llamar a Juan", H), ctx({ candidatos: [c1, c2] }));
  assert.equal(r.tipo, "pregunta");
  if (r.tipo !== "pregunta") return;
  assert.deepEqual(r.opciones.map((o) => o.etiqueta), ["Llamar a Juan (1)", "Llamar a Juan (2)"]);
  const segunda = analizar(r.opciones[1]!.texto, H);
  assert.equal(segunda.tipo === "escribir" && segunda.elegida, T(2));
  const final = resolverAnalisis(segunda, ctx({ candidatos: [c1, c2] }));
  assert.deepEqual(final.tipo === "cambios" && final.cambios, [{ operacion: "borrar", fila: `fila:tasks:${T(2)}` }]);
});

test("Dos proyectos con el mismo nombre: la opción elegida gana", () => {
  const c = ctx({ catalogo: { projects: [{ id: P1, nombre: "Casa" }, { id: P2, nombre: "Casa" }], notebooks: [] } });
  const r = resolverAnalisis(analizar("crea una tarea pagar luz en el proyecto Casa", H), c);
  assert.equal(r.tipo, "pregunta");
  if (r.tipo !== "pregunta") return;
  const final = resolverAnalisis(analizar(r.opciones[1]!.texto, H), c);
  assert.equal(final.tipo === "cambios" && (final.cambios[0] as { campos: Record<string, unknown> }).campos.project_id, `fila:projects:${P2}`);
  assert.equal(final.tipo === "cambios" && (final.cambios[0] as { campos: Record<string, unknown> }).campos.title, "pagar luz");
});
