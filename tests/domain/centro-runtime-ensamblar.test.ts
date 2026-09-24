// tests/domain/centro-runtime-ensamblar.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensamblarPantalla,
  MENSAJE_FALLO,
  MENSAJE_SIN_HIDRATADOR
} from "../../src/lib/domain/centro/runtime/ensamblar.ts";
import { eventosDeCierre } from "../../src/lib/domain/centro/runtime/aprendizaje.ts";
import type { ScreenPlan } from "../../src/lib/domain/centro/runtime/plan.ts";

const plan: ScreenPlan = {
  id: "hoy",
  intent: { kind: "hoy" },
  title: "Centro",
  huecos: [
    { id: "hero", kind: "hero" },
    { id: "narrativa", kind: "narrative" },
    { id: "foco", kind: "tasks", title: "Tu foco de hoy" },
    { id: "portafolio", kind: "portfolio", title: "Tu portafolio hoy" }
  ],
  actions: [],
  refreshPolicy: { tipo: "porFranja" }
};

const hero = async () => ({ saludo: "Hola", nombre: "Luis", fechaISO: "2026-09-24", frase: null });

test("Sin hidratador, la sección dice que todavía no sabe llenarse, y conserva su título", async () => {
  const s = await ensamblarPantalla(plan, { hero });
  const p = s.sections.find((x) => x.id === "portafolio");
  assert.deepStrictEqual(p, { id: "portafolio", title: "Tu portafolio hoy", kind: "emptyState", data: { mensaje: MENSAJE_SIN_HIDRATADOR } });
});

test("Un hidratador que lanza deja SU sección en error, y el resto se pinta", async () => {
  const s = await ensamblarPantalla(plan, {
    hero,
    tasks: async () => {
      throw new Error("se cayó");
    }
  });
  assert.strictEqual(s.sections.find((x) => x.id === "foco")?.kind, "error");
  assert.strictEqual(s.sections.find((x) => x.id === "hero")?.kind, "hero");
});

test("Un hidratador que lanza SIN promesa también se contiene", async () => {
  const s = await ensamblarPantalla(plan, {
    tasks: (() => {
      throw new Error("síncrono");
    }) as never
  });
  assert.strictEqual(s.sections.find((x) => x.id === "foco")?.kind, "error");
});

test("Un hidratador lento se corta: grafo lento = sección en error, no pantalla colgada", async () => {
  const inicio = Date.now();
  const s = await ensamblarPantalla(plan, { hero, tasks: () => new Promise<null>(() => {}) }, { tiempoMs: 30 });
  assert.ok(Date.now() - inicio < 1000);
  assert.deepStrictEqual(s.sections.find((x) => x.id === "foco")?.data, { mensaje: MENSAJE_FALLO });
});

test("`null` es «no hay nada que decir»: la sección no sale", async () => {
  const s = await ensamblarPantalla(plan, { hero, narrative: async () => null });
  assert.strictEqual(s.sections.some((x) => x.id === "narrativa"), false);
});

test("El orden es el del plan", async () => {
  const s = await ensamblarPantalla(plan, { hero });
  assert.deepStrictEqual(s.sections.map((x) => x.id), ["hero", "narrativa", "foco", "portafolio"]);
});

test("La pantalla sale con el intento y sin permiso de escritura", async () => {
  const s = await ensamblarPantalla(plan, {});
  assert.strictEqual(s.intent, "hoy");
  assert.deepStrictEqual(s.permissions, { lectura: true, escritura: false });
});

test("Cerrar sin aceptar nada es descartar", () => {
  const e = eventosDeCierre({ screenId: "hoy", intentKind: "hoy", abiertaEn: 1000, cerradaEn: 4000, aceptoAlgo: false });
  assert.deepStrictEqual(e.map((x) => x.tipo), ["tiempo", "descartada"]);
  assert.strictEqual(e[0]?.tipo === "tiempo" ? e[0].ms : -1, 3000);
});

test("Cerrar tras aceptar algo no es descartar, y el tiempo nunca es negativo", () => {
  const e = eventosDeCierre({ screenId: "hoy", intentKind: "hoy", abiertaEn: 5000, cerradaEn: 4000, aceptoAlgo: true });
  assert.deepStrictEqual(e.map((x) => x.tipo), ["tiempo"]);
  assert.strictEqual(e[0]?.tipo === "tiempo" ? e[0].ms : -1, 0);
});
