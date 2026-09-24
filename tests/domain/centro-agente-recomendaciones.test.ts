// tests/domain/centro-agente-recomendaciones.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanearRecomendacion } from "../../src/lib/domain/centro/agente/recomendaciones.ts";

const P = "11111111-1111-4111-8111-111111111111";

function foco(href: string, motivo = "Sigue con esto.") {
  return { tipo: "foco", titulo: "Continúa", motivo: "Sigue así.", datos: JSON.stringify({ href, motivo }) };
}

test("foco: un href de fuera de la app no pasa (destinoValido)", () => {
  assert.strictEqual(sanearRecomendacion(foco("//evil.example"), []), null);
});

test("foco: un href fuera del menú (inventado) no pasa", () => {
  assert.strictEqual(sanearRecomendacion(foco("/inventado"), []), null);
});

test("foco: un href de una ruta oculta no pasa", () => {
  // /notebooks está en NAV_ITEMS con hidden: true.
  assert.strictEqual(sanearRecomendacion(foco("/notebooks"), []), null);
});

test("foco: una ruta real de la app pasa", () => {
  const r = sanearRecomendacion(foco("/money"), []);
  assert.ok(r);
  assert.strictEqual(r?.tipo, "foco");
  assert.strictEqual(r?.payload.href, "/money");
});

test("foco: un proyecto que sí se leyó pasa con su ?project=", () => {
  const r = sanearRecomendacion(foco(`/execution?project=${P}`), [{ id: P }]);
  assert.ok(r);
  assert.strictEqual(r?.payload.href, `/execution?project=${P}`);
});

test("foco: un proyecto que NO se leyó no pasa", () => {
  assert.strictEqual(sanearRecomendacion(foco(`/execution?project=${P}`), []), null);
});

test("foco: cifras dentro de datos.motivo (que el 'motivo' de fuera no vio) también se rechazan", () => {
  // El "motivo" de fuera —el que ya pasó tieneCifras— es distinto del
  // "motivo" que viaja DENTRO de "datos" y que sanearPropuesta copia al
  // payload que ve la persona.
  const r = sanearRecomendacion(foco("/money", "Ahorras $3,000 este mes."), []);
  assert.strictEqual(r, null);
});

test("El 'motivo' de fuera con cifras se rechaza para cualquier tipo, antes de mirar 'datos'", () => {
  assert.strictEqual(
    sanearRecomendacion({ tipo: "tarea", titulo: "Anota esto", motivo: "Ahorra $50 al mes.", datos: "{}" }, []),
    null
  );
});

test("tarea: sanearPropuesta ignora 'datos' — con '{}' sobrevive", () => {
  const r = sanearRecomendacion({ tipo: "tarea", titulo: "Revisar el presupuesto", motivo: "Toca revisarlo.", datos: "{}" }, []);
  assert.ok(r);
  assert.strictEqual(r?.tipo, "tarea");
  assert.deepStrictEqual(r?.payload, {});
});

test("bloque: construido tal como lo describe el prompt (start/end HH:MM) sobrevive", () => {
  const datos = JSON.stringify({ start: "09:00", end: "10:00", title: "Enfoque profundo", category: "Trabajo" });
  const r = sanearRecomendacion({ tipo: "bloque", titulo: "Bloque de enfoque", motivo: "Ordena la tarde.", datos }, []);
  assert.ok(r);
  assert.strictEqual(r?.tipo, "bloque");
  assert.strictEqual(r?.payload.start, "09:00");
  assert.strictEqual(r?.payload.end, "10:00");
});

test("bloque: sin horas válidas (lo que el prompt viejo describía: fecha/inicio/fin) no sobrevive", () => {
  const datos = JSON.stringify({ fecha: "2026-09-24", inicio: "09:00", fin: "10:00", categoria: "Trabajo" });
  assert.strictEqual(sanearRecomendacion({ tipo: "bloque", titulo: "Bloque", motivo: "Ordena la tarde.", datos }, []), null);
});

test("Un título con cifras no pasa", () => {
  assert.strictEqual(sanearRecomendacion({ ...foco("/money"), titulo: "Ahorra $500" }, []), null);
});
