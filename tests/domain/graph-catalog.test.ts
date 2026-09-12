// tests/domain/graph-catalog.test.ts
//
// El vocabulario del grafo se genera desde la base (0060 + gen:graph-catalog),
// y estas pruebas vigilan las tres cosas que esa generación podría romper sin
// que nada fallara:
//
//   · que los colores sigan siendo los mismos ahora que se derivan en vez de
//     escribirse — un color que cambia no da error, solo se ve raro;
//   · que la geometría siga cubriendo todos los tipos;
//   · que cada entidad proyectada sepa a qué pantalla lleva.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NODE_CATALOG, REL_CATALOG, ROUTE_TEMPLATES
} from "../../src/lib/domain/graph/catalog.generated.ts";
import { NODE_STYLES, EDGE_STYLES, styleOf } from "../../src/lib/domain/graph/theme.ts";
import { buildImpactReport } from "../../src/lib/domain/graph/impact.ts";

test("los colores son los mismos que había escritos a mano antes de derivarlos", () => {
  // Escritos aquí a propósito, copiados del `NODE_STYLES` anterior a 0060. Si
  // alguien cambia un color en la base, esta prueba se pone en rojo y obliga a
  // decidirlo a conciencia en vez de descubrirlo mirando el lienzo.
  const esperados: Record<string, string> = {
    workspace: "--accent", project: "--c-purple", task: "--c-purple",
    person: "--c-pink", document: "--c-blue", note: "--c-blue",
    decision: "--c-blue", meeting: "--c-pink", goal: "--c-orange",
    routine: "--c-orange", habit: "--c-orange", book: "--c-orange",
    investment: "--c-green", budget: "--c-green", asset: "--c-green",
    ai_conversation: "--c-teal", risk: "--danger", custom: "--muted"
  };
  for (const [tipo, colorVar] of Object.entries(esperados)) {
    assert.strictEqual(NODE_STYLES[tipo as keyof typeof NODE_STYLES].colorVar, colorVar, tipo);
  }
  assert.strictEqual(Object.keys(NODE_STYLES).length, Object.keys(esperados).length);
});

test("todo tipo del catálogo tiene radio, y ninguno se cuela sin él", () => {
  for (const tipo of Object.keys(NODE_CATALOG)) {
    const estilo = NODE_STYLES[tipo as keyof typeof NODE_STYLES];
    assert.ok(estilo, `${tipo} no tiene estilo`);
    assert.ok(Number.isFinite(estilo.radius) && estilo.radius > 0, `${tipo} sin radio`);
  }
});

test("styleOf cae a `custom` con un tipo que el catálogo todavía no conoce", () => {
  // El catálogo es una tabla y puede crecer sin que el navegador se entere.
  assert.deepStrictEqual(styleOf("tipo_que_no_existe"), NODE_STYLES.custom);
});

test("toda relación del catálogo tiene estilo de línea", () => {
  for (const rel of Object.keys(REL_CATALOG)) {
    assert.ok(EDGE_STYLES[rel as keyof typeof EDGE_STYLES], `${rel} no tiene estilo`);
  }
});

test("las relaciones que ROMPEN son las que el catálogo marca como dependencia", () => {
  const dependencias = Object.entries(REL_CATALOG)
    .filter(([, r]) => r.dependencia)
    .map(([rel]) => rel)
    .sort();
  assert.deepStrictEqual(dependencias, ["blocks", "caused_by", "depends_on", "leads_to"]);

  // Y que `buildImpactReport` las use de verdad: una arista de dependencia
  // cuenta como rotura, una de estructura no.
  const informe = buildImpactReport([
    { nodeId: "a", parentId: null, viaRel: "depends_on", depth: 1, label: "A", nodeType: "task", entityTable: null, entityId: null },
    { nodeId: "b", parentId: null, viaRel: "belongs_to", depth: 1, label: "B", nodeType: "task", entityTable: null, entityId: null }
  ]);
  assert.deepStrictEqual(informe.breaking.map((r) => r.nodeId), ["a"]);
});

test("los tipos sin tabla detrás son exactamente los cuatro nativos", () => {
  const nativos = Object.entries(NODE_CATALOG)
    .filter(([, n]) => !n.proyectado)
    .map(([tipo]) => tipo)
    .sort();
  assert.deepStrictEqual(nativos, ["ai_conversation", "custom", "meeting", "risk"]);
});

test("cada entidad proyectada sabe a qué pantalla lleva", () => {
  const rutas = Object.entries(ROUTE_TEMPLATES);
  assert.ok(rutas.length >= 14, "faltan fuentes en el mapa de rutas");
  for (const [tabla, plantilla] of rutas) {
    assert.ok(plantilla.startsWith("/"), `${tabla}: «${plantilla}» no es una ruta`);
  }
});

test("las dos entidades que no tenían enlace ya lo tienen", () => {
  // `task_files` (Documento) y `logbook` (Decisión) faltaban en el mapa escrito
  // a mano de NodeInspector desde 0054: se veían en el grafo y no se podía
  // llegar a ellas.
  assert.ok(ROUTE_TEMPLATES.task_files);
  assert.ok(ROUTE_TEMPLATES.logbook);
});

test("el marcador {id} se sustituye, y solo donde lo hay", () => {
  assert.strictEqual(
    ROUTE_TEMPLATES.projects.replace("{id}", "abc"),
    "/execution?project=abc"
  );
  assert.strictEqual(ROUTE_TEMPLATES.tasks.replace("{id}", "abc"), "/execution");
});
