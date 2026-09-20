// tests/domain/centro-captura.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanearCaptura, type CapturaCruda, type ContextoDeCaptura } from "../../src/lib/domain/centro/captura.ts";

// La barra del centro (D-168): escribes una idea y la IA dice dónde va. Este
// saneado es lo que impide que «dónde va» sea un sitio que no existe.
//
// LA REGLA DE ORO: ante cualquier duda, se degrada a `pregunta`. Preguntar es
// barato; guardar algo en el cuaderno equivocado es un desorden que la persona
// tiene que ir a limpiar.

const CUADERNO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROYECTO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AJENO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const ctx: ContextoDeCaptura = {
  notebooks: [{ id: CUADERNO, title: "Ideas" }],
  proyectos: [{ id: PROYECTO, title: "Rediseño" }]
};

test("Una nota con su cuaderno se conserva entera", () => {
  const cruda: CapturaCruda = { clase: "nota", notebookId: CUADERNO, titulo: "Envíos gratis", cuerpo: "Probar en octubre" };
  const r = sanearCaptura(cruda, ctx);
  assert.strictEqual(r.clase, "nota");
  assert.strictEqual(r.clase === "nota" && r.notebookId, CUADERNO);
  assert.strictEqual(r.clase === "nota" && r.cuerpo, "Probar en octubre");
});

test("Un cuaderno que no existe degrada a pregunta", () => {
  const cruda: CapturaCruda = { clase: "nota", notebookId: AJENO, titulo: "x", cuerpo: "y" };
  assert.strictEqual(sanearCaptura(cruda, ctx).clase, "pregunta");
});

test("Una tarea con su proyecto se conserva", () => {
  const cruda: CapturaCruda = { clase: "tarea", projectId: PROYECTO, titulo: "Llamar al proveedor" };
  const r = sanearCaptura(cruda, ctx);
  assert.strictEqual(r.clase, "tarea");
  assert.strictEqual(r.clase === "tarea" && r.projectId, PROYECTO);
});

test("Un proyecto ajeno degrada a pregunta", () => {
  assert.strictEqual(sanearCaptura({ clase: "tarea", projectId: AJENO, titulo: "x" }, ctx).clase, "pregunta");
});

test("Sin título no se guarda nada: degrada a pregunta", () => {
  assert.strictEqual(sanearCaptura({ clase: "nota", notebookId: CUADERNO, titulo: "   ", cuerpo: "y" }, ctx).clase, "pregunta");
});

test("Una clase inventada degrada a pregunta", () => {
  assert.strictEqual(sanearCaptura({ clase: "teletransporte", titulo: "x" } as CapturaCruda, ctx).clase, "pregunta");
});

test("Una pregunta conserva sus opciones, pero como mucho tres", () => {
  const cruda: CapturaCruda = {
    clase: "pregunta",
    pregunta: "¿Nota o tarea?",
    opciones: [
      { etiqueta: "Nota en Ideas", clase: "nota", id: CUADERNO },
      { etiqueta: "Tarea en Rediseño", clase: "tarea", id: PROYECTO },
      { etiqueta: "Nota en Ideas otra vez", clase: "nota", id: CUADERNO },
      { etiqueta: "Una cuarta", clase: "nota", id: CUADERNO }
    ]
  };
  const r = sanearCaptura(cruda, ctx);
  assert.strictEqual(r.clase, "pregunta");
  assert.ok(r.clase === "pregunta" && r.opciones.length <= 3);
});

test("Una opción que apunta a algo que no existe se cae de la pregunta", () => {
  const cruda: CapturaCruda = {
    clase: "pregunta",
    pregunta: "¿Dónde?",
    opciones: [
      { etiqueta: "Buena", clase: "nota", id: CUADERNO },
      { etiqueta: "Mala", clase: "tarea", id: AJENO }
    ]
  };
  const r = sanearCaptura(cruda, ctx);
  assert.deepStrictEqual(r.clase === "pregunta" && r.opciones.map((o) => o.etiqueta), ["Buena"]);
});

test("Sin cuadernos ni proyectos, siempre pregunta", () => {
  const vacio: ContextoDeCaptura = { notebooks: [], proyectos: [] };
  assert.strictEqual(sanearCaptura({ clase: "nota", notebookId: CUADERNO, titulo: "x", cuerpo: "y" }, vacio).clase, "pregunta");
});

test("Una pregunta sin texto igual se puede pintar: lleva una por defecto", () => {
  const r = sanearCaptura({ clase: "pregunta", pregunta: "", opciones: [] }, ctx);
  assert.strictEqual(r.clase, "pregunta");
  assert.ok(r.clase === "pregunta" && r.pregunta.length > 0);
});
