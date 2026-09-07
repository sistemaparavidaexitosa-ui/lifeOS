// tests/domain/coach-schedule.test.ts
// Cuándo habla el coach. Si esto se rompe, o no habla nunca o habla de más —y
// «de más» aquí significa hacer sonar un teléfono a deshora.
import { test } from "node:test";
import assert from "node:assert/strict";
import { momentoQueToca, claveDelCoach, PREFS_POR_DEFECTO } from "../../src/lib/domain/coach/schedule.ts";

test("momentoQueToca: a la hora en punto de la mañana, toca el de la mañana", () => {
  assert.strictEqual(momentoQueToca("07:00"), "morning");
  assert.strictEqual(momentoQueToca("07:55"), "morning");
});

test("momentoQueToca: a la hora de la noche, toca el de la noche", () => {
  assert.strictEqual(momentoQueToca("21:00"), "night");
});

test("momentoQueToca: antes de la hora, no toca nada", () => {
  assert.strictEqual(momentoQueToca("06:59"), null);
  assert.strictEqual(momentoQueToca("20:30"), null);
});

test("momentoQueToca: se recupera hasta tres horas tarde, y ni una más", () => {
  // Es para cuando el reloj no pasó, no para avisar a deshora.
  assert.strictEqual(momentoQueToca("09:30"), "morning");
  assert.strictEqual(momentoQueToca("10:00"), null, "cuatro horas tarde ya no es «buenos días»");
});

test("momentoQueToca: a las once de la noche no llega el buenos días de esa mañana", () => {
  // Lo que toca a esa hora es el cierre del día, nunca el saludo de hace 17 h.
  assert.strictEqual(momentoQueToca("23:59", { enabled: true, morningHour: 7, nightHour: 21 }), "night");
  // Y si el de la noche está puesto muy temprano, a las 23:59 no queda nada.
  assert.strictEqual(momentoQueToca("23:59", { enabled: true, morningHour: 7, nightHour: 18 }), null);
});

test("momentoQueToca: con el coach apagado no toca nunca", () => {
  assert.strictEqual(momentoQueToca("07:00", { ...PREFS_POR_DEFECTO, enabled: false }), null);
  assert.strictEqual(momentoQueToca("21:00", { ...PREFS_POR_DEFECTO, enabled: false }), null);
});

test("momentoQueToca: si las dos ventanas se pisan, gana la noche", () => {
  // El de la mañana ya no tiene nada que aportar a un día que terminó.
  assert.strictEqual(momentoQueToca("21:00", { enabled: true, morningHour: 20, nightHour: 21 }), "night");
});

test("momentoQueToca: las horas se pueden mover a cualquier punto del día", () => {
  assert.strictEqual(momentoQueToca("05:00", { enabled: true, morningHour: 5, nightHour: 23 }), "morning");
  assert.strictEqual(momentoQueToca("23:30", { enabled: true, morningHour: 5, nightHour: 23 }), "night");
});

test("momentoQueToca: una hora ilegible no dispara nada", () => {
  assert.strictEqual(momentoQueToca(""), null);
  assert.strictEqual(momentoQueToca("ab:cd"), null);
});

test("claveDelCoach: la fecha local va dentro, que es lo que evita el duplicado", () => {
  assert.strictEqual(claveDelCoach("morning", "2026-09-06"), "coach:morning:2026-09-06");
  assert.notStrictEqual(claveDelCoach("morning", "2026-09-06"), claveDelCoach("morning", "2026-09-07"));
  assert.notStrictEqual(claveDelCoach("morning", "2026-09-06"), claveDelCoach("night", "2026-09-06"));
});
