// D-205 E2: los formularios del día a día, de la frase a la tarjeta, sin modelo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analizar } from "../../src/lib/domain/centro/interprete/analizar.ts";
import { extraerNumero } from "../../src/lib/domain/centro/interprete/valores.ts";
import { resolverAnalisis, type Candidato, type ContextoDeResolucion } from "../../src/lib/domain/centro/interprete/resolver.ts";
import { validarCambio } from "../../src/lib/domain/centro/escritura/cambio.ts";
import type { Domain } from "../../src/lib/domain/insights/types.ts";

const H = "2026-10-18";
const HAB = "55555555-5555-4555-8555-555555555555";
const TAR = "66666666-6666-4666-8666-666666666666";
const PRO = "77777777-7777-4777-8777-777777777777";
const FIL = "88888888-8888-4888-8888-888888888888";
const TODOS: Domain[] = ["money", "execution", "time", "habits", "debt", "activity", "nutrition", "growth"];

function ctx(parcial: Partial<ContextoDeResolucion> = {}): ContextoDeResolucion {
  return {
    autorizados: TODOS,
    catalogo: { habits: [{ id: HAB, nombre: "Meditar" }], tasks: [{ id: TAR, nombre: "Llamar a Juan" }], projects: [{ id: PRO, nombre: "Casa" }] },
    candidatos: [],
    alimentos: [],
    hoy: H,
    ...parcial
  };
}

function cambio(texto: string, c = ctx()) {
  const r = resolverAnalisis(analizar(texto, H), c);
  assert.equal(r.tipo, "cambios", JSON.stringify(r));
  if (r.tipo !== "cambios") throw new Error("sin cambios");
  const v = validarCambio(r.cambios[0], { filas: r.filas, autorizados: TODOS });
  assert.ok(v.ok, !v.ok ? v.reason : "");
  return { ...(r.cambios[0] as { tabla?: string; operacion: string; campos: Record<string, unknown> }), entendi: r.entendi };
}

function candidato(tabla: string, registro: Record<string, unknown>, nombre: string): Candidato {
  return { fila: `fila:${tabla}:${FIL}`, nombre, exacta: true, registro: { id: FIL, ...registro } };
}

test("extraerNumero: miles con coma, signo de pesos y etiqueta antes del número", () => {
  assert.equal(extraerNumero("meta de 50,000 pesos", ["pesos"])?.valor, 50000);
  assert.equal(extraerNumero("vale $2,500,000", [], ["vale"])?.valor, 2500000);
  assert.equal(extraerNumero("saldo 4500.50", [], ["saldo"])?.valor, 4500.5);
  assert.equal(extraerNumero("comi 80,5 g", ["g"])?.valor, 80.5);
  assert.deepEqual(extraerNumero("a la pagina 120 ya", [], ["pagina"]), { valor: 120, frase: "pagina 120" });
  assert.deepEqual(extraerNumero("dormi 7 horas", ["horas"], ["dormi"]), { valor: 7, frase: "dormi 7 horas" });
});

test("Hábito: «marca el hábito meditar como hecho» registra hoy, hecho", () => {
  const c = cambio("marca el hábito meditar como hecho");
  assert.equal(c.tabla, "habit_logs");
  assert.deepEqual(c.campos, { habit_id: `fila:habits:${HAB}`, log_date: H, status: "completed" });
  assert.match(c.entendi, /^Registrar el hábito «Meditar»/);
});

test("Hábito: omitido ayer", () => {
  const c = cambio("marca el hábito meditar como omitido ayer");
  assert.deepEqual(c.campos, { habit_id: `fila:habits:${HAB}`, log_date: "2026-10-17", status: "skipped" });
});

test("Hábito que no existe: «No encontré ningún hábito…»", () => {
  const r = resolverAnalisis(analizar("marca el hábito correr como hecho", H), ctx());
  assert.deepEqual(r, { tipo: "nada", entendi: "No encontré ningún hábito que se llame «correr»." });
});

test("Recordatorio: «recuérdame la tarea llamar a Juan mañana»", () => {
  const c = cambio("recuérdame la tarea llamar a Juan mañana");
  assert.equal(c.tabla, "reminders");
  assert.deepEqual(c.campos, { subject_id: `fila:tasks:${TAR}`, remind_on: "2026-10-19" });
});

test("Proyecto: crear con fecha y prioridad", () => {
  const c = cambio("crea un proyecto Mudanza para el 30 de noviembre, prioridad alta");
  assert.equal(c.tabla, "projects");
  assert.deepEqual(c.campos, { title: "Mudanza", target_date: "2026-11-30", priority: "High" });
  assert.equal(c.entendi, "Crear el proyecto «Mudanza» · fecha objetivo 30 nov · prioridad alta");
});

test("Proyecto: «en el proyecto Casa» sigue siendo una tarea, no un proyecto", () => {
  const c = cambio("crea una tarea revisar planos en el proyecto Casa");
  assert.equal(c.tabla, "tasks");
  assert.equal(c.campos.project_id, `fila:projects:${PRO}`);
  assert.equal(c.campos.title, "revisar planos");
});

test("Proyecto: «a activo» es el estado del proyecto, no un activo del patrimonio", () => {
  const a = analizar("cambia el proyecto Casa a activo", H);
  assert.equal(a.tipo === "escribir" && a.tabla, "projects");
  assert.deepEqual(a.tipo === "escribir" && a.valores, { status: "Active" });
});

test("Meta de ahorro: «meta de ahorro» gana a «meta», con miles y tipo", () => {
  const c = cambio("crea una meta de ahorro «Japón» de 50,000 pesos para viajes");
  assert.equal(c.tabla, "savings_goals");
  assert.deepEqual(c.campos, { name: "Japón", target: 50000, type: "Viajes", current_amount: 0, monthly: 0, priority: "Medium" });
});

test("Meta personal: área y estado por defecto", () => {
  const c = cambio("crea una meta aprender piano, área aprendizaje");
  assert.equal(c.tabla, "personal_goals");
  assert.deepEqual(c.campos, { title: "aprender piano", area: "Aprendizaje", status: "Activa" });
  assert.match(c.entendi, /^Crear la meta personal «aprender piano»/);
});

test("Meta financiera: crear con monto", () => {
  const c = cambio("crea una meta financiera «Enganche» de 300000 pesos");
  assert.equal(c.tabla, "financial_goals");
  assert.deepEqual(c.campos, { name: "Enganche", target: 300000, current_amount: 0, priority: "Medium" });
});

test("Deuda: editar el saldo", () => {
  const c = cambio(
    "cambia la deuda tarjeta saldo 4500",
    ctx({ candidatos: [candidato("debts", { name: "Tarjeta", balance: 5000, rate: 40, min_payment: 300, due_day: 10 }, "Tarjeta")] })
  );
  assert.deepEqual(c, { operacion: "editar", fila: `fila:debts:${FIL}`, campos: { balance: 4500 }, entendi: "Cambiar la deuda «Tarjeta» · saldo 4500" });
});

test("Deuda: crear sin todos los datos es trabajo de la IA", () => {
  assert.equal(resolverAnalisis(analizar("crea una deuda Coche", H), ctx()).tipo, "ia");
});

test("Libro: «actualiza el libro Dune a la página 120»", () => {
  const a = analizar("actualiza el libro Dune a la página 120", H);
  assert.equal(a.tipo === "escribir" && a.resto, "dune");
  const c = cambio("actualiza el libro Dune a la página 120", ctx({ candidatos: [candidato("books", { title: "Dune", status: "Leyendo", current_page: 80 }, "Dune")] }));
  assert.deepEqual(c.campos, { current_page: 120 });
});

test("Libro: crear con estado y total de páginas", () => {
  const c = cambio("agrega el libro «Hábitos atómicos» de 320 páginas, leyendo");
  assert.equal(c.tabla, "books");
  assert.deepEqual(c.campos, { title: "Hábitos atómicos", status: "Leyendo", total_pages: 320 });
});

test("Activo: crear con valor, fecha de hoy y fuente por defecto", () => {
  const c = cambio("registra un activo Casa de playa valor $2,500,000");
  assert.equal(c.tabla, "assets");
  assert.deepEqual(c.campos, { name: "Casa de playa", kind: "Otros", value: 2500000, as_of: H, source: "Estimación" });
});

test("Bitácora: lo dictado es el aprendizaje", () => {
  const c = cambio("anota en la bitácora: aprendí que debo delegar");
  assert.equal(c.tabla, "logbook");
  assert.deepEqual(c.campos, { text: "aprendí que debo delegar" });
});

test("Reflexión del día: texto, ánimo, energía y sueño", () => {
  const c = cambio("registra mi reflexión: buen día, ánimo 4, energía 3, dormí 7 horas");
  assert.equal(c.tabla, "daily_reflections");
  assert.deepEqual(c.campos, { reflection: "buen día", mood: 4, energy: 3, sleep_hours: 7 });
  assert.match(c.entendi, /^Registrar la reflexión del día/);
});

test("Un dominio apagado no se escribe aunque se entienda", () => {
  const r = resolverAnalisis(analizar("cambia la deuda tarjeta saldo 4500", H), ctx({ autorizados: ["execution"] }));
  assert.equal(r.tipo, "ia");
});
