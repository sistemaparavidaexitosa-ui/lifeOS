import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarCambio,
  aGuardar,
  revalidarGuardado,
  aplicarCorrecciones,
  valoresIguales
} from "../../src/lib/domain/centro/escritura/cambio.ts";

const P = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const N = "33333333-3333-4333-8333-333333333333";
const filas = new Map<string, Record<string, unknown>>([
  [`fila:projects:${P}`, { id: P, title: "Tesis" }],
  [`fila:tasks:${T}`, { id: T, title: "Leer capítulo 2", status: "Pending", priority: "Medium", due: null }],
  [`fila:notebooks:${N}`, { id: N, title: "Ideas" }]
]);
const ctx = { filas, autorizados: ["execution", "nutrition"] as const };

test("Crear: una tarea en un proyecto leído; la ref se guarda como uuid", () => {
  const r = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:projects:${P}`, title: "Escribir intro", priority: "High" } }, ctx);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.cambio, {
    operacion: "crear",
    tabla: "tasks",
    id: null,
    campos: { project_id: P, title: "Escribir intro", priority: "High" },
    antes: null,
    ignorados: []
  });
});

test("Crear: user_id, id y campos inventados se ignoran, no tumban el cambio", () => {
  const r = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:projects:${P}`, title: "X", user_id: "otro", id: T, color: "rojo", status: "Completed" } }, ctx);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.cambio.campos, { project_id: P, title: "X" });
  assert.deepStrictEqual(r.ok && r.cambio.ignorados.sort(), ["color", "id", "status", "user_id"]);
});

test("Crear: sin un obligatorio, fuera", () => {
  const r = validarCambio({ operacion: "crear", tabla: "tasks", campos: { title: "Sin proyecto" } }, ctx);
  assert.deepStrictEqual(r, { ok: false, reason: "tasks: falta «project_id»." });
});

test("Crear: una ref que no se leyó en el turno, fuera", () => {
  const otro = "44444444-4444-4444-8444-444444444444";
  const r = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:projects:${otro}`, title: "X" } }, ctx);
  assert.strictEqual(r.ok, false);
});

test("Crear: una ref a una fila de OTRA tabla, fuera", () => {
  const r = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:notebooks:${N}`, title: "X" } }, ctx);
  assert.strictEqual(r.ok, false);
});

test("Crear: números como texto pasan como número (Review Focus 1)", () => {
  const r = validarCambio(
    { operacion: "crear", tabla: "food_entries", campos: { meal: "Desayuno", name: "Avena", grams: "80", kcal100: "389", protein100: 17 } },
    ctx
  );
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.cambio.campos, { meal: "Desayuno", name: "Avena", grams: 80, kcal100: 389, protein100: 17 });
});

test("Crear: `numero` se redondea a 2 decimales — food_entries.grams es numeric(7,2) (D-203 fix round 2)", () => {
  const r = validarCambio(
    { operacion: "crear", tabla: "food_entries", campos: { meal: "Desayuno", name: "Avena", grams: "83.456", kcal100: "389" } },
    ctx
  );
  assert.ok(r.ok);
  assert.strictEqual(r.ok && r.cambio.campos.grams, 83.46);
});

test("Crear: opción fuera de la lista, fecha que no existe, número fuera de rango: fuera", () => {
  for (const campos of [
    { meal: "Merienda", name: "Pan", grams: 50, kcal100: 250 },
    { meal: "Cena", name: "Pan", grams: 50, kcal100: 250, local_date: "2026-02-30" },
    { meal: "Cena", name: "Pan", grams: 0, kcal100: 250 },
    { meal: "Cena", name: "Pan", grams: 50, kcal100: 2000 }
  ]) {
    assert.strictEqual(validarCambio({ operacion: "crear", tabla: "food_entries", campos }, ctx).ok, false, JSON.stringify(campos));
  }
});

test("Tabla fuera del registro o de un dominio apagado: fuera, con el mismo motivo", () => {
  const a = validarCambio({ operacion: "crear", tabla: "profiles", campos: { ai_domains: ["money"] } }, ctx);
  const b = validarCambio({ operacion: "crear", tabla: "food_entries", campos: { meal: "Cena", name: "Pan", grams: 1, kcal100: 1 } }, { ...ctx, autorizados: ["execution"] });
  assert.deepStrictEqual(a, { ok: false, reason: "«profiles» no se puede escribir." });
  assert.deepStrictEqual(b, { ok: false, reason: "«food_entries» no se puede escribir." });
});

test("Editar: sobre una fila leída; el antes sale de la fila, no del modelo", () => {
  const r = validarCambio({ operacion: "editar", fila: `fila:tasks:${T}`, campos: { status: "Completed" } }, ctx);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && { id: r.cambio.id, tabla: r.cambio.tabla, campos: r.cambio.campos, antes: r.cambio.antes }, {
    id: T,
    tabla: "tasks",
    campos: { status: "Completed" },
    antes: { id: T, title: "Leer capítulo 2", status: "Pending", priority: "Medium", due: null }
  });
});

test("Editar: fila no leída, fuera", () => {
  const r = validarCambio({ operacion: "editar", fila: "fila:tasks:55555555-5555-4555-8555-555555555555", campos: { status: "Completed" } }, ctx);
  assert.deepStrictEqual(r, { ok: false, reason: "fila:tasks:55555555-5555-4555-8555-555555555555 no se leyó en este turno." });
});

test("Editar: nada cambia de verdad (mismo valor o solo campos soloCrear), fuera", () => {
  assert.strictEqual(validarCambio({ operacion: "editar", fila: `fila:tasks:${T}`, campos: { status: "Pending" } }, ctx).ok, false);
  assert.strictEqual(validarCambio({ operacion: "editar", fila: `fila:tasks:${T}`, campos: { project_id: `fila:projects:${P}` } }, ctx).ok, false);
});

test("Borrar: sobre una fila leída, sin campos", () => {
  const r = validarCambio({ operacion: "borrar", fila: `fila:tasks:${T}` }, ctx);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && { op: r.cambio.operacion, id: r.cambio.id, campos: r.cambio.campos }, { op: "borrar", id: T, campos: {} });
});

test("Borrar: de una tabla que se lee pero no se escribe (projects), fuera", () => {
  assert.strictEqual(validarCambio({ operacion: "borrar", fila: `fila:projects:${P}` }, ctx).ok, false);
});

test("Operación desconocida, fuera", () => {
  assert.strictEqual(validarCambio({ operacion: "truncar", tabla: "tasks" }, ctx).ok, false);
});

const guardado = () => {
  const r = validarCambio({ operacion: "crear", tabla: "food_entries", campos: { meal: "Cena", name: "Pan", grams: 50, kcal100: 250 } }, ctx);
  assert.ok(r.ok);
  return aGuardar(r.cambio);
};

test("revalidarGuardado: lo guardado vuelve a pasar", () => {
  const g = guardado();
  assert.deepStrictEqual(revalidarGuardado(JSON.parse(JSON.stringify(g)), ["nutrition"]), { ok: true, cambio: g });
});

test("revalidarGuardado: dominio apagado después de proponer (Review Focus 4)", () => {
  assert.deepStrictEqual(revalidarGuardado(guardado(), ["execution"]), { ok: false, reason: "Dominio no autorizado." });
});

test("revalidarGuardado: payload manipulado (tabla prohibida, campo de más, ref no uuid)", () => {
  assert.strictEqual(revalidarGuardado({ ...guardado(), tabla: "profiles" }, ["nutrition"]).ok, false);
  assert.strictEqual(revalidarGuardado({ ...guardado(), campos: { ...guardado().campos, user_id: "x" } }, ["nutrition"]).ok, false);
  const t = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:projects:${P}`, title: "X" } }, ctx);
  assert.ok(t.ok);
  const g = aGuardar(t.cambio);
  assert.strictEqual(revalidarGuardado({ ...g, campos: { ...g.campos, project_id: "no-uuid" } }, ["execution"]).ok, false);
});

test("aplicarCorrecciones: la persona corrige los gramos antes de guardar", () => {
  const r = aplicarCorrecciones(guardado(), { grams: "20" });
  assert.ok(r.ok);
  assert.strictEqual(r.ok && r.cambio.campos.grams, 20);
});

test("aplicarCorrecciones: la corrección también se redondea a lo que numeric(7,2) guardaría (D-203 fix round 2)", () => {
  const r = aplicarCorrecciones(guardado(), { grams: "20.005" });
  assert.ok(r.ok);
  // 20.005 * 100 = 2000.5 exacto en IEEE754 (no hay error de precisión en este
  // caso concreto) y Math.round redondea .5 hacia arriba, igual que el
  // redondeo de `numeric` en Postgres: 20.01. Si algún otro valor cayera en un
  // caso donde 1e2 no represente el decimal exacto, `Math.round(n*100)/100`
  // podría diferir en el último dígito de lo que guarde Postgres — no se usa
  // una librería decimal para esto (fuera de alcance de este fix).
  assert.strictEqual(r.ok && r.cambio.campos.grams, 20.01);
});

test("aplicarCorrecciones: vaciar un obligatorio, tocar una ref o un campo ajeno: motivo legible (Review Focus 3)", () => {
  assert.deepStrictEqual(aplicarCorrecciones(guardado(), { name: "  " }), { ok: false, reason: "«Alimento» no puede quedar vacío." });
  assert.strictEqual(aplicarCorrecciones(guardado(), { user_id: "x" }).ok, false);
  const t = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:projects:${P}`, title: "X" } }, ctx);
  assert.ok(t.ok);
  assert.strictEqual(aplicarCorrecciones(aGuardar(t.cambio), { project_id: P }).ok, false);
});

test("aplicarCorrecciones: un borrado no se corrige", () => {
  const b = validarCambio({ operacion: "borrar", fila: `fila:tasks:${T}` }, ctx);
  assert.ok(b.ok);
  assert.strictEqual(aplicarCorrecciones(aGuardar(b.cambio), { title: "x" }).ok, false);
});

test("valoresIguales: null, undefined y '' son la misma nada", () => {
  assert.strictEqual(valoresIguales(null, undefined), true);
  assert.strictEqual(valoresIguales(null, ""), true);
  assert.strictEqual(valoresIguales("", undefined), true);
  assert.strictEqual(valoresIguales(null, 0), false); // 0 es un valor real, no «nada»
});

test("valoresIguales: número guardado vs numeric de Postgres devuelto como texto", () => {
  assert.strictEqual(valoresIguales(20, "20.00"), true);
  assert.strictEqual(valoresIguales("80", 80), true);
  assert.strictEqual(valoresIguales(80, 81), false);
});

test("valoresIguales: fechas AAAA-MM-DD, comparación de texto", () => {
  assert.strictEqual(valoresIguales("2026-01-01", "2026-01-01"), true);
  assert.strictEqual(valoresIguales("2026-01-01", "2026-01-02"), false);
});

test("valoresIguales: texto que no es numérico compara como texto, no como NaN === NaN", () => {
  assert.strictEqual(valoresIguales("Leer capítulo 2", "Leer capítulo 2"), true);
  assert.strictEqual(valoresIguales("Leer capítulo 2", "Otro título"), false);
});
