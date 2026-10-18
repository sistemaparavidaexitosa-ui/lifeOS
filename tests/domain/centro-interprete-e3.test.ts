// D-205 E3: dinero, presupuesto, cuentas, peso, horario, comentarios e identidad, sin modelo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analizar } from "../../src/lib/domain/centro/interprete/analizar.ts";
import { extraerRangoDeHoras } from "../../src/lib/domain/centro/interprete/valores.ts";
import { resolverAnalisis, type ContextoDeResolucion } from "../../src/lib/domain/centro/interprete/resolver.ts";
import { validarCambio } from "../../src/lib/domain/centro/escritura/cambio.ts";
import type { Domain } from "../../src/lib/domain/insights/types.ts";

const H = "2026-10-18";
const BAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EFE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TAR = "66666666-6666-4666-8666-666666666666";
const TODOS: Domain[] = ["money", "execution", "time", "habits", "debt", "activity", "nutrition", "growth"];

function ctx(parcial: Partial<ContextoDeResolucion> = {}): ContextoDeResolucion {
  return {
    autorizados: TODOS,
    catalogo: { accounts: [{ id: BAN, nombre: "Banorte" }], tasks: [{ id: TAR, nombre: "Llamar a Juan" }] },
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
  return { ...(r.cambios[0] as { tabla?: string; campos: Record<string, unknown> }), entendi: r.entendi };
}

test("extraerRangoDeHoras: «de 9 a 2» es de 9 a 14; am/pm y minutos", () => {
  assert.deepEqual(extraerRangoDeHoras("trabajo de 9 a 2"), { valor: ["09:00", "14:00"], frase: "de 9 a 2" });
  assert.deepEqual(extraerRangoDeHoras("de 7 a 8:30 am")?.valor, ["07:00", "08:30"]);
  assert.deepEqual(extraerRangoDeHoras("de 6 a 9 pm")?.valor, ["18:00", "21:00"]);
  assert.deepEqual(extraerRangoDeHoras("de 10:15 a 11")?.valor, ["10:15", "11:00"]);
  assert.equal(extraerRangoDeHoras("de 25 a 30"), null);
});

test("Gasto: «gasté 300 en comida» con la única cuenta, hoy", () => {
  const c = cambio("gasté 300 en comida");
  assert.equal(c.tabla, "journal_entries");
  assert.deepEqual(c.campos, { type: "expense", amount: 300, memo: "comida", account_id: `fila:accounts:${BAN}`, entry_date: H, category: "Otros" });
  assert.match(c.entendi, /^Registrar el movimiento «comida»/);
});

test("Ingreso con cuenta nombrada entre varias, y miles", () => {
  const c = cambio(
    "registra un ingreso de 15,000 pesos sueldo con la cuenta Banorte",
    ctx({ catalogo: { accounts: [{ id: EFE, nombre: "Efectivo" }, { id: BAN, nombre: "Banorte" }] } })
  );
  assert.deepEqual(c.campos, { type: "income", amount: 15000, memo: "sueldo", account_id: `fila:accounts:${BAN}`, entry_date: H, category: "Otros" });
});

test("Gasto con varias cuentas y ninguna nombrada: pregunta en cuál", () => {
  const r = resolverAnalisis(analizar("gasté 300 en comida", H), ctx({ catalogo: { accounts: [{ id: EFE, nombre: "Efectivo" }, { id: BAN, nombre: "Banorte" }] } }));
  assert.equal(r.tipo, "pregunta");
  assert.match(r.tipo === "pregunta" ? r.entendi : "", /¿En qué cuenta\?/);
});

test("Cuenta: «crea una cuenta Nu de ahorro» es una cuenta, no una meta de ahorro", () => {
  const c = cambio("crea una cuenta Nu de ahorro");
  assert.equal(c.tabla, "accounts");
  assert.deepEqual(c.campos, { name: "Nu", type: "savings", currency: "MXN", opening_balance: 0 });
});

test("Presupuesto: concepto y costo mensual", () => {
  const c = cambio("crea un presupuesto Gasolina de 2000 al mes");
  assert.equal(c.tabla, "budgets");
  assert.deepEqual(c.campos, { category: "Gasolina", monthly_cost: 2000 });
});

test("Peso: «peso 78.5 kilos» y con grasa", () => {
  assert.deepEqual(cambio("peso 78.5 kilos").campos, { weight_kg: 78.5 });
  const c = cambio("registra mi peso: 80 kg, grasa 20%");
  assert.equal(c.tabla, "body_measurements");
  assert.deepEqual(c.campos, { weight_kg: 80, body_fat_pct: 20 });
  assert.match(c.entendi, /^Registrar el peso · peso 80 · grasa corporal % 20$/);
});

test("Ocupación: título, horas, día y categoría", () => {
  const c = cambio("agrega una ocupación «Gimnasio» mañana de 7 a 8:30 am, salud");
  assert.equal(c.tabla, "occupations");
  assert.deepEqual(c.campos, { title: "Gimnasio", start_time: "07:00", end_time: "08:30", occ_date: "2026-10-19", category: "Salud" });
});

test("Ocupación sin horas: trabajo de la IA", () => {
  assert.equal(resolverAnalisis(analizar("agrega una ocupación Gimnasio mañana", H), ctx()).tipo, "ia");
});

test("Comentario en una tarea", () => {
  const c = cambio("comenta en la tarea llamar a Juan, ya le marqué");
  assert.equal(c.tabla, "comments");
  assert.deepEqual(c.campos, { subject_id: `fila:tasks:${TAR}`, body: "ya le marqué" });
});

test("Rasgo de identidad con área", () => {
  const c = cambio("agrega el rasgo Disciplinado, área salud");
  assert.equal(c.tabla, "identity_traits");
  assert.deepEqual(c.campos, { name: "Disciplinado", area: "Salud" });
});

test("«¿cuánto gasté?» sigue siendo de la IA", () => {
  assert.equal(analizar("¿cuánto gasté en comida?", H).tipo, "ia");
});
