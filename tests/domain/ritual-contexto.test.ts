// tests/domain/ritual-contexto.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hechosDeContexto, UMBRAL_SATURACION, type EntradaContexto } from "../../src/lib/domain/ritual/contexto.ts";

// Qué cifras del día merecen un hueco en una pantalla que solo tiene sitio para
// unas pocas, y con qué tono. Cero formato: aquí solo hay números — quien los
// escribe con su moneda y su signo es la pantalla.

function entrada(e: Partial<EntradaContexto> = {}): EntradaContexto {
  return {
    liquidez: 10_000,
    presupuestoRestante: 3_000,
    hayPresupuesto: true,
    vencidas: 0,
    impacto: 0,
    saturacionPct: 40,
    recordatoriosHoy: 0,
    ...e
  };
}

function ids(e: EntradaContexto): string[] {
  return hechosDeContexto(e).map((h) => h.id);
}

function hecho(e: EntradaContexto, id: string) {
  return hechosDeContexto(e).find((h) => h.id === id);
}

test("Un día tranquilo enseña solo el dinero, que siempre es cierto", () => {
  assert.deepStrictEqual(ids(entrada()), ["liquidez", "presupuesto"]);
});

test("Cero vencidas no produce hecho: una cifra en cero no es una noticia", () => {
  assert.strictEqual(hecho(entrada({ vencidas: 0 }), "vencidas"), undefined);
});

test("Las tareas vencidas entran, y entran en tono malo", () => {
  const h = hecho(entrada({ vencidas: 3 }), "vencidas");
  assert.strictEqual(h?.valor, 3);
  assert.strictEqual(h?.tono, "bad");
  assert.strictEqual(h?.unidad, "conteo");
});

test("Las tareas de impacto entran como información, no como alarma", () => {
  const h = hecho(entrada({ impacto: 2 }), "impacto");
  assert.strictEqual(h?.valor, 2);
  assert.strictEqual(h?.tono, "info");
});

test("Los recordatorios de hoy entran solo si los hay", () => {
  assert.strictEqual(hecho(entrada({ recordatoriosHoy: 0 }), "recordatorios"), undefined);
  assert.strictEqual(hecho(entrada({ recordatoriosHoy: 2 }), "recordatorios")?.valor, 2);
});

test("La saturación solo aparece cuando el día ya viene apretado", () => {
  assert.strictEqual(hecho(entrada({ saturacionPct: UMBRAL_SATURACION - 1 }), "saturacion"), undefined);
  const h = hecho(entrada({ saturacionPct: UMBRAL_SATURACION }), "saturacion");
  assert.strictEqual(h?.tono, "warn");
  assert.strictEqual(h?.unidad, "porcentaje");
});

test("La liquidez en negativo es una mala noticia, no un dato neutro", () => {
  assert.strictEqual(hecho(entrada({ liquidez: 500 }), "liquidez")?.tono, "info");
  assert.strictEqual(hecho(entrada({ liquidez: -500 }), "liquidez")?.tono, "bad");
});

test("El presupuesto pasado de largo es una mala noticia", () => {
  assert.strictEqual(hecho(entrada({ presupuestoRestante: 1 }), "presupuesto")?.tono, "ok");
  assert.strictEqual(hecho(entrada({ presupuestoRestante: -1 }), "presupuesto")?.tono, "bad");
});

test("Sin presupuesto configurado no se inventa un cero (NO-MOCK)", () => {
  // «Te quedan $0» y «no tienes presupuesto» son cosas distintas, y con un solo
  // número no se distinguen: por eso `hayPresupuesto` es un campo propio.
  assert.strictEqual(hecho(entrada({ hayPresupuesto: false, presupuestoRestante: 0 }), "presupuesto"), undefined);
});

test("Lo urgente va antes que lo informativo, y el dinero al final", () => {
  const e = entrada({ vencidas: 1, impacto: 2, recordatoriosHoy: 1, saturacionPct: 95 });
  assert.deepStrictEqual(ids(e), ["vencidas", "saturacion", "impacto", "recordatorios", "liquidez", "presupuesto"]);
});

test("Todos los hechos llevan etiqueta legible: la pantalla no inventa nombres", () => {
  for (const h of hechosDeContexto(entrada({ vencidas: 1, impacto: 1, recordatoriosHoy: 1, saturacionPct: 99 }))) {
    assert.ok(h.etiqueta.length > 0, `el hecho «${h.id}» no trae etiqueta`);
  }
});
