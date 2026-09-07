// tests/domain/coach-proposals.test.ts
// Lo que el coach propone y el usuario va a pulsar. Si algo de aquí se rompe,
// hay botones que fallan al pulsarlos — que es peor que no tenerlos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanearPropuesta, sanearPropuestas, type PropuestaCruda } from "../../src/lib/domain/coach/proposals.ts";

const PROYECTO = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function cruda(over: Partial<PropuestaCruda> = {}): PropuestaCruda {
  return { tipo: "tarea", titulo: "Llamar al fontanero", detalle: "", datos: "", ...over };
}

test("sanearPropuesta: un tipo que no existe se descarta entero", () => {
  assert.strictEqual(sanearPropuesta(cruda({ tipo: "transferencia" })), null);
});

test("sanearPropuesta: sin título no hay botón que pintar", () => {
  assert.strictEqual(sanearPropuesta(cruda({ titulo: "   " })), null);
});

test("sanearPropuesta: una tarea solo necesita su título", () => {
  const p = sanearPropuesta(cruda());
  assert.ok(p);
  assert.strictEqual(p.tipo, "tarea");
  assert.deepStrictEqual(p.payload, {});
});

test("sanearPropuesta: los saltos de línea y espacios de más se aplanan", () => {
  const p = sanearPropuesta(cruda({ titulo: "  Llamar   al\n fontanero  " }));
  assert.strictEqual(p?.titulo, "Llamar al fontanero");
});

test("sanearPropuesta: un bloque sin horas válidas no se ofrece", () => {
  for (const datos of ['{"start":"9:00","end":"10:00"}', '{"start":"09:00"}', '{"start":"25:00","end":"26:00"}', ""]) {
    assert.strictEqual(sanearPropuesta(cruda({ tipo: "bloque", datos })), null, datos);
  }
});

test("sanearPropuesta: un bloque cuyo fin no es posterior al inicio no se ofrece", () => {
  const datos = '{"start":"10:00","end":"10:00"}';
  assert.strictEqual(sanearPropuesta(cruda({ tipo: "bloque", datos })), null);
});

test("sanearPropuesta: un bloque válido conserva horas y cae en una categoría real", () => {
  const p = sanearPropuesta(
    cruda({ tipo: "bloque", titulo: "Rutina de mañana", datos: '{"start":"07:00","end":"07:30","category":"Salud"}' })
  );
  assert.ok(p);
  assert.deepStrictEqual(p.payload, { title: "Rutina de mañana", start: "07:00", end: "07:30", category: "Salud" });
});

test("sanearPropuesta: una categoría inventada cae en Personal en vez de romper la acción", () => {
  const p = sanearPropuesta(cruda({ tipo: "bloque", datos: '{"start":"07:00","end":"08:00","category":"Ocio"}' }));
  assert.strictEqual(p?.payload.category, "Personal");
});

test("sanearPropuesta: una frecuencia inventada cae en Diario", () => {
  const p = sanearPropuesta(cruda({ tipo: "rutina", titulo: "Rutina nocturna", datos: '{"frequency":"Cada dos días"}' }));
  assert.strictEqual(p?.payload.frequency, "Diario");
  assert.strictEqual(p?.payload.name, "Rutina nocturna");
});

test("sanearPropuesta: una estructura sin un proyecto real no lleva a ninguna parte", () => {
  for (const datos of ["", '{"projectId":"p1"}', '{"projectId":""}']) {
    assert.strictEqual(sanearPropuesta(cruda({ tipo: "estructura", datos })), null, datos);
  }
});

test("sanearPropuesta: una estructura con su proyecto se acepta", () => {
  const p = sanearPropuesta(cruda({ tipo: "estructura", titulo: "Dividir en fases", datos: `{"projectId":"${PROYECTO}"}` }));
  assert.strictEqual(p?.payload.projectId, PROYECTO);
});

test("sanearPropuesta: un área inventada cae en Personal", () => {
  const p = sanearPropuesta(cruda({ tipo: "meta", titulo: "Correr 10k", datos: '{"area":"Deporte"}' }));
  assert.strictEqual(p?.payload.area, "Personal");
  assert.strictEqual(p?.payload.title, "Correr 10k");
});

test("sanearPropuesta: un JSON roto no lanza, se trata como si no viniera", () => {
  const p = sanearPropuesta(cruda({ tipo: "meta", titulo: "Correr 10k", datos: "{no es json" }));
  assert.ok(p, "una meta se sostiene con el título solo");
  assert.strictEqual(p.payload.area, "Personal");
});

test("sanearPropuesta: un JSON que no es objeto tampoco lanza", () => {
  for (const datos of ["[1,2]", '"texto"', "null", "42"]) {
    const p = sanearPropuesta(cruda({ tipo: "meta", titulo: "X", datos }));
    assert.ok(p, datos);
  }
});

test("sanearPropuestas: se descartan las malas y se conservan las buenas, con tope", () => {
  const salida = sanearPropuestas([
    cruda({ tipo: "bloque", datos: "{}" }), // mala
    cruda({ titulo: "Una" }),
    cruda({ titulo: "Dos" }),
    cruda({ titulo: "Tres" })
  ]);
  assert.deepStrictEqual(salida.map((p) => p.titulo), ["Una", "Dos"]);
});

test("sanearPropuestas: sin propuestas no revienta", () => {
  assert.deepStrictEqual(sanearPropuestas([]), []);
});
