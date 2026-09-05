// tests/domain/push-schedule.test.ts
//
// Decidir QUÉ toca avisar es lógica pura y aquí se prueba entera, sin base de
// datos. El despachador (src/app/api/push/dispatch) solo trae filas y reparte.
//
// Lo delicado es la hora: el "ahora" entra como parámetro, en la zona del
// perfil (D-016/D-018). Con `new Date()` dentro, el recordatorio de las nueve
// de la mañana de alguien en México sonaría de madrugada.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recordatoriosQueTocan,
  resumenDeVencimientos,
  type ReminderPendiente,
  type TareaConVencimiento
} from "../../src/lib/domain/push/schedule.ts";

const base = { subjectType: "task" as const, subjectId: "t1", text: "Llamar al banco" };

test("un recordatorio con hora no suena antes de su hora", () => {
  const r: ReminderPendiente[] = [{ ...base, id: "r1", remindOnISO: "2026-09-04", remindAt: "15:30" }];

  assert.deepEqual(recordatoriosQueTocan(r, { todayISO: "2026-09-04", horaLocal: "15:29", digestHour: 8 }), []);
  assert.equal(recordatoriosQueTocan(r, { todayISO: "2026-09-04", horaLocal: "15:30", digestHour: 8 }).length, 1);
});

test("un recordatorio SIN hora se entrega a la hora del resumen", () => {
  const r: ReminderPendiente[] = [{ ...base, id: "r1", remindOnISO: "2026-09-04", remindAt: null }];

  assert.deepEqual(recordatoriosQueTocan(r, { todayISO: "2026-09-04", horaLocal: "07:59", digestHour: 8 }), []);
  assert.equal(recordatoriosQueTocan(r, { todayISO: "2026-09-04", horaLocal: "08:00", digestHour: 8 }).length, 1);
});

test("un recordatorio atrasado suena igual, aunque su hora ya pasara hace días", () => {
  // Es la promesa de 0038: «un recordatorio que se quedó atrás porque no
  // abriste la app el martes no debe desaparecer en silencio».
  const r: ReminderPendiente[] = [{ ...base, id: "r1", remindOnISO: "2026-09-01", remindAt: "23:00" }];
  assert.equal(recordatoriosQueTocan(r, { todayISO: "2026-09-04", horaLocal: "00:05", digestHour: 8 }).length, 1);
});

test("uno de mañana no suena hoy por tarde que sea", () => {
  const r: ReminderPendiente[] = [{ ...base, id: "r1", remindOnISO: "2026-09-05", remindAt: "00:00" }];
  assert.deepEqual(recordatoriosQueTocan(r, { todayISO: "2026-09-04", horaLocal: "23:59", digestHour: 8 }), []);
});

test("salen ordenados del más antiguo al más reciente", () => {
  const r: ReminderPendiente[] = [
    { ...base, id: "nuevo", remindOnISO: "2026-09-04", remindAt: "09:00" },
    { ...base, id: "viejo", remindOnISO: "2026-09-01", remindAt: "09:00" }
  ];
  assert.deepEqual(
    recordatoriosQueTocan(r, { todayISO: "2026-09-04", horaLocal: "10:00", digestHour: 8 }).map((x) => x.id),
    ["viejo", "nuevo"]
  );
});

// ─── Resumen de vencimientos ─────────────────────────────────────────────────

const t = (id: string, dueISO: string): TareaConVencimiento => ({ id, title: `Tarea ${id}`, dueISO });

test("sin nada que venza, no hay resumen — no se avisa de que no hay nada", () => {
  assert.equal(resumenDeVencimientos([], "2026-09-04"), null);
  assert.equal(resumenDeVencimientos([t("a", "2026-09-10")], "2026-09-04"), null);
});

test("una sola tarea: el aviso la nombra, no da un número", () => {
  const r = resumenDeVencimientos([t("a", "2026-09-04")], "2026-09-04");
  assert.ok(r);
  assert.match(r.body, /Tarea a/);
});

test("varias tareas: UN aviso agrupado, no uno por tarea", () => {
  const r = resumenDeVencimientos(
    [t("a", "2026-09-04"), t("b", "2026-09-04"), t("c", "2026-09-01")],
    "2026-09-04"
  );
  assert.ok(r);
  // 2 vencen hoy y 1 está atrasada: el texto tiene que distinguirlo, porque no
  // es lo mismo «hoy» que «se te pasó».
  assert.match(r.body, /2/);
  assert.match(r.body, /1/);
  assert.match(r.body, /atrasad/i);
});

test("solo atrasadas: no dice que vence algo hoy", () => {
  const r = resumenDeVencimientos([t("a", "2026-09-01")], "2026-09-04");
  assert.ok(r);
  assert.doesNotMatch(r.body, /hoy/i);
});

// ─── La hora local, que es de donde salen los minutos del recordatorio ───────

test("timeInTimeZone da «HH:MM» en la zona del perfil, no en la del servidor", async () => {
  const { timeInTimeZone } = await import("../../src/lib/domain/datetime.ts");
  // 2026-09-04T18:45:00Z son las 12:45 en Ciudad de México (UTC-6).
  const instante = new Date("2026-09-04T18:45:00Z");
  assert.equal(timeInTimeZone("America/Mexico_City", instante), "12:45");
  assert.equal(timeInTimeZone("UTC", instante), "18:45");
});

test("timeInTimeZone: medianoche es 00:00 y no 24:00", async () => {
  const { timeInTimeZone } = await import("../../src/lib/domain/datetime.ts");
  assert.equal(timeInTimeZone("UTC", new Date("2026-09-04T00:00:00Z")), "00:00");
});
