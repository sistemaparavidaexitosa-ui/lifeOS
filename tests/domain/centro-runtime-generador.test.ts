// tests/domain/centro-runtime-generador.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generadorDeterminista } from "../../src/lib/domain/centro/runtime/generador.ts";
import { aplicarLayout } from "../../src/lib/domain/centro/runtime/layout.ts";
import { FLAGS_APAGADOS } from "../../src/lib/domain/centro/runtime/flags.ts";
import { INTENT_KINDS, type Screen } from "../../src/lib/domain/centro/runtime/types.ts";

const entrada = (kind: (typeof INTENT_KINDS)[number], ref?: string) => ({
  intent: ref ? { kind, ref } : { kind },
  franja: "manana" as const,
  flags: { ...FLAGS_APAGADOS }
});

test("«Hoy» es hero, narrativa, foco y atajos, en ese orden", async () => {
  const plan = await generadorDeterminista.generar(entrada("hoy"));
  assert.deepStrictEqual(plan.huecos.map((h) => h.kind), ["hero", "narrative", "tasks", "quickActions"]);
  assert.deepStrictEqual(plan.refreshPolicy, { tipo: "porFranja" });
  assert.deepStrictEqual(plan.actions, []);
});

test("Misma entrada, mismo plan", async () => {
  const a = await generadorDeterminista.generar(entrada("hoy"));
  const b = await generadorDeterminista.generar(entrada("hoy"));
  assert.deepStrictEqual(a, b);
});

test("Cada plan es una copia: tocarlo no cambia el siguiente", async () => {
  const a = await generadorDeterminista.generar(entrada("hoy"));
  a.huecos[0]!.title = "tocado";
  a.huecos.pop();
  const b = await generadorDeterminista.generar(entrada("hoy"));
  assert.strictEqual(b.huecos.length, 4);
  assert.strictEqual(b.huecos[0]!.title, undefined);
});

test("Todos los intentos tienen plan, con ids de hueco únicos y sin datos", async () => {
  for (const kind of INTENT_KINDS) {
    const plan = await generadorDeterminista.generar(entrada(kind));
    assert.ok(plan.huecos.length > 0, kind);
    assert.strictEqual(new Set(plan.huecos.map((h) => h.id)).size, plan.huecos.length, kind);
    assert.ok(!JSON.stringify(plan).includes('"data"'), kind);
  }
});

test("Fuera de «hoy» siempre hay una salida de vuelta", async () => {
  const plan = await generadorDeterminista.generar(entrada("portafolio"));
  assert.deepStrictEqual(plan.actions, [{ label: "Volver a hoy", intent: "hoy" }]);
});

test("El proyecto se titula con su nombre", async () => {
  const plan = await generadorDeterminista.generar(entrada("proyecto", "Malpaso"));
  assert.strictEqual(plan.title, "Malpaso");
  assert.strictEqual(plan.id, "proyecto:malpaso");
});

function pantalla(n: number): Screen {
  return {
    id: "x",
    intent: "hoy",
    title: "x",
    layout: { densidad: "compacta" },
    sections: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, kind: "text" as const, data: { texto: String(i) } })),
    actions: [],
    refreshPolicy: { tipo: "alAbrir" },
    permissions: { lectura: true, escritura: false }
  };
}

test("El layout no reordena", () => {
  const r = aplicarLayout(pantalla(4), FLAGS_APAGADOS);
  assert.deepStrictEqual(r.sections.map((s) => s.id), ["s0", "s1", "s2", "s3"]);
});

test("Hasta seis secciones, aireada; más, compacta", () => {
  assert.strictEqual(aplicarLayout(pantalla(6), FLAGS_APAGADOS).layout.densidad, "aireada");
  assert.strictEqual(aplicarLayout(pantalla(7), FLAGS_APAGADOS).layout.densidad, "compacta");
});

test("Con el motor encendido, Fase 1 hace lo mismo", () => {
  const conMotor = aplicarLayout(pantalla(4), { ...FLAGS_APAGADOS, runtime: true, layoutEngine: true });
  assert.deepStrictEqual(conMotor, aplicarLayout(pantalla(4), FLAGS_APAGADOS));
});
