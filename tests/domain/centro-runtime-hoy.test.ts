// tests/domain/centro-runtime-hoy.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hidratadoresDeHoy, accionesRapidas, MAX_FOCO, type FuentesDeHoy, type LectorDelGrafo } from "../../src/lib/domain/centro/runtime/hoy.ts";
import { generadorDeterminista } from "../../src/lib/domain/centro/runtime/generador.ts";
import { ensamblarPantalla } from "../../src/lib/domain/centro/runtime/ensamblar.ts";
import { validarScreen } from "../../src/lib/domain/centro/runtime/validador.ts";
import { FLAGS_APAGADOS } from "../../src/lib/domain/centro/runtime/flags.ts";

const MALPASO = "11111111-1111-4111-8111-111111111111";

function fuentes(cambios: Partial<FuentesDeHoy> = {}): FuentesDeHoy {
  return {
    saludo: "Buenos días",
    nombre: "Luis",
    fechaISO: "2026-09-24",
    resumen: "Vas bien. Tu enfoque en Malpaso está dando resultados.",
    unicaCosa: "Cerrar el entregable U3",
    tareas: [
      { id: "t1", title: "Revisar avances U3" },
      { id: "t2", title: "Llamar a proveedor" }
    ],
    senales: { vencidas: 0, diasParaFinDeQuincena: 9, presupuestoEnRojo: false },
    habitosPendientes: 2,
    ...cambios
  };
}

const grafo: LectorDelGrafo = {
  async proyectoDeTarea(id) {
    return id === "t1" ? { id: MALPASO, titulo: "Malpaso" } : null;
  }
};

const grafoRoto: LectorDelGrafo = {
  async proyectoDeTarea() {
    throw new Error("sin red");
  }
};

async function pantalla(f: FuentesDeHoy, g: LectorDelGrafo = grafo) {
  const plan = await generadorDeterminista.generar({ intent: { kind: "hoy" }, franja: "manana", flags: { ...FLAGS_APAGADOS } });
  return ensamblarPantalla(plan, hidratadoresDeHoy(f, g));
}

test("El foco empieza por la una cosa y lleva el proyecto que dice el grafo", async () => {
  const s = await pantalla(fuentes());
  const foco = s.sections.find((x) => x.id === "foco");
  assert.ok(foco && foco.kind === "tasks");
  assert.deepStrictEqual(foco.data.items, [
    { id: "una-cosa", titulo: "Cerrar el entregable U3", contexto: "Una cosa", href: null },
    { id: "t1", titulo: "Revisar avances U3", contexto: "Proyecto · Malpaso", href: `/execution?project=${MALPASO}` },
    { id: "t2", titulo: "Llamar a proveedor", contexto: null, href: "/execution" }
  ]);
});

test("Grafo que lanza: las filas salen sin proyecto y la pantalla sigue siendo válida", async () => {
  const s = await pantalla(fuentes(), grafoRoto);
  const foco = s.sections.find((x) => x.id === "foco");
  assert.ok(foco && foco.kind === "tasks");
  assert.ok(foco.data.items.every((i) => i.id === "una-cosa" || (i.contexto === null && i.href === "/execution")));
  assert.strictEqual(validarScreen(s, { proyectos: [] }).ok, true);
});

test("Como mucho cinco en el foco, contando la una cosa", async () => {
  const tareas = Array.from({ length: 9 }, (_, i) => ({ id: `t${i + 10}`, title: `Tarea ${i}` }));
  const s = await pantalla(fuentes({ tareas }));
  const foco = s.sections.find((x) => x.id === "foco");
  assert.strictEqual(foco?.kind === "tasks" ? foco.data.items.length : -1, MAX_FOCO);
});

test("Día vacío: queda el saludo y los atajos, y valida", async () => {
  const s = await pantalla(fuentes({ resumen: "  ", unicaCosa: null, tareas: [], habitosPendientes: 0 }));
  assert.deepStrictEqual(s.sections.map((x) => x.kind), ["hero", "quickActions"]);
  assert.strictEqual(validarScreen(s, { proyectos: [] }).ok, true);
});

test("La pantalla entera de hoy pasa el validador con los proyectos que vio el grafo", async () => {
  const s = await pantalla(fuentes());
  const r = validarScreen(s, { proyectos: [{ id: MALPASO }] });
  assert.strictEqual(r.ok, true, r.ok ? "" : r.reason);
});

test("Texto del usuario con marcado: la pantalla no valida (y el Centro cae al lienzo)", async () => {
  const s = await pantalla(fuentes({ unicaCosa: "Migrar <Header> a v2" }));
  assert.strictEqual(validarScreen(s, { proyectos: [{ id: MALPASO }] }).ok, false);
});

test("Los atajos hablan en singular cuando toca", () => {
  const a = accionesRapidas(fuentes({ senales: { vencidas: 1, diasParaFinDeQuincena: 1, presupuestoEnRojo: false }, habitosPendientes: 1 }));
  assert.deepStrictEqual(a.map((x) => x.detalle), ["1 vencida", "1 pendiente", "Lectura", "Quincena en 1 día"]);
});

test("Los atajos: rojo manda sobre quincena, y al día cuando no queda nada", () => {
  const a = accionesRapidas(fuentes({ senales: { vencidas: 0, diasParaFinDeQuincena: 2, presupuestoEnRojo: true }, habitosPendientes: 0 }));
  assert.deepStrictEqual(a.map((x) => x.detalle), ["Sin vencidas", "Al día", "Lectura", "Presupuesto en rojo"]);
  assert.deepStrictEqual(a.map((x) => x.href), ["/execution", "/development/routines", "/development/library", "/money"]);
});

test("Textos larguísimos del usuario se recortan en vez de tumbar la pantalla", async () => {
  const largo = (n: number) => "x".repeat(n);
  const g: LectorDelGrafo = { proyectoDeTarea: async () => ({ id: MALPASO, titulo: largo(115) }) };
  const s = await pantalla(fuentes({ unicaCosa: largo(190), tareas: [{ id: "t1", title: largo(250) }] }), g);
  const r = validarScreen(s, { proyectos: [{ id: MALPASO }] });
  assert.strictEqual(r.ok, true, r.ok ? "" : r.reason);
  const foco = s.sections.find((x) => x.id === "foco");
  assert.ok(foco && foco.kind === "tasks");
  assert.ok(foco.data.items[1]!.titulo.endsWith("…"));
});

test("«Proyectos» no dice «en el plan»: esas tareas son las de impacto, no el plan", () => {
  const a = accionesRapidas(fuentes({ tareas: [] }));
  assert.ok(!a[0]!.detalle.includes("plan"));
});
