import { test } from "node:test";
import assert from "node:assert/strict";
import { cargaDelDia, type EntradaDeCarga } from "../../src/lib/domain/tiempo/carga.ts";

const HOY = "2026-10-19"; // lunes

function entrada(c: Partial<EntradaDeCarga> = {}): EntradaDeCarga {
  return {
    hoy: HOY,
    ventana: { start: "08:00", end: "18:00" }, // 600 min
    ocupaciones: [{ start: "09:00", end: "13:00" }], // 240
    tareas: [
      { est: 60, due: HOY, impact: false, status: "Pending" },
      { est: 30, due: null, impact: true, status: "InProgress" },
      { est: 90, due: "2026-10-25", impact: false, status: "Pending" }, // otro día: no cuenta
      { est: 45, due: HOY, impact: true, status: "Completed" } // hecha: no cuenta
    ],
    rutinas: [
      { frequency: "Diario", active: true, ligadaAOcupacion: false, minutos: 30 },
      { frequency: "Fin de semana", active: true, ligadaAOcupacion: false, minutos: 60 }, // hoy no toca
      { frequency: "Diario", active: true, ligadaAOcupacion: true, minutos: 20 }, // ya cuenta su ocupación
      { frequency: "Diario", active: false, ligadaAOcupacion: false, minutos: 40 } // pausada
    ],
    ...c
  };
}

test("Suma lo que cada sección le pide al día, sin contar dos veces", () => {
  const c = cargaDelDia(entrada());
  assert.equal(c.capMin, 600);
  assert.deepEqual(
    c.partes.map((p) => [p.fuente, p.minutos]),
    [["ocupaciones", 240], ["tareas", 90], ["rutinas", 30]]
  );
  assert.equal(c.total, 360);
  assert.equal(c.libre, 240);
  assert.equal(c.pct, 60);
  assert.equal(c.estado, "ok");
  assert.match(c.consejo, /4 h libres/);
});

test("Al 80 % avisa: el margen para imprevistos es parte del plan", () => {
  const c = cargaDelDia(entrada({ ocupaciones: [{ start: "09:00", end: "15:00" }] }));
  assert.equal(c.pct, 80);
  assert.equal(c.estado, "lleno");
  assert.match(c.consejo, /margen/);
});

test("Pasado el 100 % dice cuánto sobra y qué mover", () => {
  const c = cargaDelDia(entrada({ ocupaciones: [{ start: "08:00", end: "17:00" }] }));
  assert.equal(c.estado, "saturado");
  assert.equal(c.libre, 0);
  assert.match(c.consejo, /Te pasas 1 h/);
});

test("Ocupaciones fuera de la ventana no cuentan; sin ventana no hay capacidad", () => {
  assert.equal(cargaDelDia(entrada({ ocupaciones: [{ start: "19:00", end: "21:00" }] })).partes[0]!.minutos, 0);
  const c = cargaDelDia(entrada({ ventana: { start: "10:00", end: "10:00" } }));
  assert.equal(c.capMin, 0);
  assert.equal(c.estado, "saturado");
});
