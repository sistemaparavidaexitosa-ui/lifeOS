import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TIMEZONE,
  addDaysISO,
  diffDays,
  greetingFor,
  hourInTimeZone,
  isValidTimeZone,
  todayInTimeZone,
  weekStartISO
} from "../../src/lib/domain/datetime.ts";

// 21-ago-2026 19:30 UTC = 13:30 en Ciudad de México (UTC-6, horario de verano).
// Este instante es EXACTAMENTE el bug reportado: el servidor (UTC) creía que
// eran las 19 h y saludaba "Buenas noches" a la 1:30 de la tarde.
const INSTANT = new Date("2026-08-21T19:30:00Z");

test("hourInTimeZone devuelve la hora del usuario, no la del servidor", () => {
  assert.strictEqual(hourInTimeZone("America/Mexico_City", INSTANT), 13);
  assert.strictEqual(hourInTimeZone("UTC", INSTANT), 19);
});

test("greetingFor: 13 h en México es 'Buenas tardes' (regresión del bug de Home)", () => {
  assert.strictEqual(greetingFor(hourInTimeZone("America/Mexico_City", INSTANT)), "Buenas tardes");
  assert.strictEqual(greetingFor(hourInTimeZone("UTC", INSTANT)), "Buenas noches");
});

test("greetingFor cubre los tres tramos y sus fronteras", () => {
  assert.strictEqual(greetingFor(0), "Buenos días");
  assert.strictEqual(greetingFor(11), "Buenos días");
  assert.strictEqual(greetingFor(12), "Buenas tardes");
  assert.strictEqual(greetingFor(18), "Buenas tardes");
  assert.strictEqual(greetingFor(19), "Buenas noches");
  assert.strictEqual(greetingFor(23), "Buenas noches");
});

test("todayInTimeZone: a las 20:00 de México el servidor UTC ya es el día siguiente", () => {
  // 22-ago 02:00 UTC = 21-ago 20:00 en México. El hábito marcado a esa hora
  // debe contar para el 21, no para el 22.
  const nightInMexico = new Date("2026-08-22T02:00:00Z");
  assert.strictEqual(todayInTimeZone("America/Mexico_City", nightInMexico), "2026-08-21");
  assert.strictEqual(todayInTimeZone("UTC", nightInMexico), "2026-08-22");
});

test("todayInTimeZone respeta zonas adelantadas (Tokio ya es mañana)", () => {
  assert.strictEqual(todayInTimeZone("Asia/Tokyo", INSTANT), "2026-08-22");
  assert.strictEqual(todayInTimeZone("America/Mexico_City", INSTANT), "2026-08-21");
});

test("una zona inválida cae al default en vez de lanzar", () => {
  assert.strictEqual(isValidTimeZone("America/Mexico_City"), true);
  assert.strictEqual(isValidTimeZone("Mexico/CDMX"), false);
  assert.strictEqual(isValidTimeZone(""), false);
  // No lanza: la página no debe caerse por un typo en Configuración.
  assert.strictEqual(
    todayInTimeZone("Zona/Inventada", INSTANT),
    todayInTimeZone(DEFAULT_TIMEZONE, INSTANT)
  );
});

test("medianoche exacta reporta hora 0, no 24", () => {
  const midnight = new Date("2026-08-21T06:00:00Z"); // 00:00 en México
  assert.strictEqual(hourInTimeZone("America/Mexico_City", midnight), 0);
  assert.strictEqual(todayInTimeZone("America/Mexico_City", midnight), "2026-08-21");
});

test("addDaysISO y diffDays operan sobre fechas calendario", () => {
  assert.strictEqual(addDaysISO("2026-08-21", 7), "2026-08-28");
  assert.strictEqual(addDaysISO("2026-08-31", 1), "2026-09-01");
  assert.strictEqual(diffDays("2026-08-21", "2026-08-28"), 7);
});

// El lunes es el ancla de semana de TODO el OS: routineDueToday("Semanal") lo
// usa, /planning arranca ahí y la cola de lectura (migración 0042) lo impone
// con un check en la columna. Una sola función para que no haya dos criterios.
test("weekStartISO devuelve el lunes de la semana que contiene la fecha", () => {
  assert.strictEqual(weekStartISO("2026-09-01"), "2026-08-31"); // martes
  assert.strictEqual(weekStartISO("2026-09-06"), "2026-08-31"); // domingo: MISMA semana
  assert.strictEqual(weekStartISO("2026-09-07"), "2026-09-07"); // lunes: se queda igual
});

test("weekStartISO cruza el fin de año sin romperse", () => {
  // 1-ene-2027 es viernes; su lunes cae en el año anterior.
  assert.strictEqual(weekStartISO("2027-01-01"), "2026-12-28");
});
