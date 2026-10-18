import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizar, entreComillas } from "../../src/lib/domain/centro/interprete/normalizar.ts";
import { extraerFecha, extraerNumero, extraerOpcion } from "../../src/lib/domain/centro/interprete/valores.ts";

// 2026-10-18 es domingo.
const H = "2026-10-18";

test("normalizar: minúsculas, sin acentos ni signos sueltos, espacios simples", () => {
  assert.equal(normalizar("¡Créa  una TAREA!"), "crea una tarea");
  assert.equal(normalizar("  Desayuné 80 g, ¿vale?  "), "desayune 80 g, vale");
  assert.equal(normalizar("$350.50 el 2026-11-02"), "$350.50 el 2026-11-02");
});

test("entreComillas: el primer texto entre comillas, tal cual", () => {
  assert.equal(entreComillas("crea «Llamar a Juan» mañana"), "Llamar a Juan");
  assert.equal(entreComillas('nota "Café con Ana"'), "Café con Ana");
  assert.equal(entreComillas("tarea “Leer” ya"), "Leer");
  assert.equal(entreComillas("sin comillas"), null);
});

test("extraerFecha: relativas", () => {
  assert.deepEqual(extraerFecha("para manana", H), { valor: "2026-10-19", frase: "manana" });
  assert.equal(extraerFecha("pasado manana", H)?.valor, "2026-10-20");
  assert.equal(extraerFecha("pasado manana", H)?.frase, "pasado manana");
  assert.equal(extraerFecha("ayer", H)?.valor, "2026-10-17");
  assert.equal(extraerFecha("hoy", H)?.valor, "2026-10-18");
  assert.equal(extraerFecha("en 3 dias", H)?.valor, "2026-10-21");
  assert.equal(extraerFecha("la proxima semana", H)?.valor, "2026-10-19");
});

test("extraerFecha: día de la semana — el de hoy es el de la semana que viene", () => {
  assert.equal(extraerFecha("el lunes", H)?.valor, "2026-10-19");
  assert.equal(extraerFecha("el lunes", H)?.frase, "el lunes");
  assert.equal(extraerFecha("el domingo", H)?.valor, "2026-10-25");
  assert.equal(extraerFecha("viernes", H)?.valor, "2026-10-23");
});

test("extraerFecha: día del mes y fechas completas", () => {
  assert.equal(extraerFecha("el 25", H)?.valor, "2026-10-25");
  assert.equal(extraerFecha("el 18", H)?.valor, "2026-10-18");
  assert.equal(extraerFecha("el 5", H)?.valor, "2026-11-05");
  assert.equal(extraerFecha("25 de diciembre", H)?.valor, "2026-12-25");
  assert.equal(extraerFecha("el 3 de enero", H)?.valor, "2027-01-03");
  assert.equal(extraerFecha("2026-11-02", H)?.valor, "2026-11-02");
});

test("extraerFecha: lo que no es fecha no se inventa", () => {
  assert.equal(extraerFecha("el 31 de febrero", H), null);
  assert.equal(extraerFecha("llamar a juan", H), null);
  assert.equal(extraerFecha("2026-02-30", H), null);
  assert.equal(extraerFecha("compre 3 manzanas", H), null);
});

test("extraerNumero: con su unidad, coma o punto", () => {
  assert.deepEqual(extraerNumero("80 g de avena", ["g", "gr", "gramos"]), { valor: 80, frase: "80 g" });
  assert.equal(extraerNumero("1,5 gramos", ["gramos"])?.valor, 1.5);
  assert.equal(extraerNumero("150gr de pollo", ["g", "gr"])?.valor, 150);
  assert.equal(extraerNumero("30 minutos", ["min", "minutos"])?.frase, "30 minutos");
  assert.equal(extraerNumero("avena", ["g"]), null);
  assert.equal(extraerNumero("80 gatos", ["g"]), null);
});

test("extraerOpcion: por palabra completa, la frase más larga gana", () => {
  const PRIO = { High: ["urgente", "alta prioridad", "prioridad alta", "alta"], Low: ["baja", "prioridad baja"] };
  assert.deepEqual(extraerOpcion("es urgente", PRIO), { valor: "High", frase: "urgente" });
  assert.equal(extraerOpcion("prioridad alta ya", PRIO)?.frase, "prioridad alta");
  assert.equal(extraerOpcion("prioridad baja", PRIO)?.valor, "Low");
  assert.equal(extraerOpcion("altamente", PRIO), null);
  assert.equal(extraerOpcion("nada", PRIO), null);
});
