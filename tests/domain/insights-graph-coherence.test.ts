// tests/domain/insights-graph-coherence.test.ts
//
// El grafo y la lista blanca de la IA son dos descripciones de «qué entidades
// hay». No se fusionan (D-150), pero tampoco pueden divergir en silencio: un
// hecho de cadena solo se emite si TODAS las tablas del camino tienen dominio,
// así que una fuente nueva del grafo sin entrada en TABLAS_CONSULTABLES
// dejaría sus cadenas mudas sin que nada fallara. Esta prueba lo hace fallar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTE_TEMPLATES } from "../../src/lib/domain/graph/catalog.generated.ts";
import { dominioDeTabla } from "../../src/lib/insights/context.ts";

/** Fuentes del grafo que la IA NO lee, cada una con su motivo. */
const FUERA_DE_LA_LISTA: Record<string, string> = {
  workspaces: "Un espacio no es un dato de la vida de nadie; las cadenas no suben a él.",
  memberships: "Son personas del equipo: la lista blanca las excluye a propósito (D-097).",
  task_files: "Un adjunto es un puntero a Storage; no aporta nada que decir."
};

test("cada fuente del grafo tiene dominio en la lista blanca, o un motivo escrito para no tenerlo", () => {
  for (const tabla of Object.keys(ROUTE_TEMPLATES)) {
    if (tabla in FUERA_DE_LA_LISTA) {
      assert.equal(dominioDeTabla(tabla), null, `${tabla} está excluida y no debería tener dominio`);
    } else {
      assert.ok(dominioDeTabla(tabla), `${tabla} se proyecta en el grafo pero la IA no sabe de qué dominio es`);
    }
  }
});

test("dominioDeTabla no inventa: una tabla desconocida no tiene dominio", () => {
  assert.equal(dominioDeTabla("push_subscriptions"), null);
  assert.equal(dominioDeTabla(""), null);
});
