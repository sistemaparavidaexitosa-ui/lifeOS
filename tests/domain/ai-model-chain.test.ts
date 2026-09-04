import { test } from "node:test";
import assert from "node:assert/strict";
import { debeSaltarDeModelo, motivoCadenaAgotada, problemasDeEsquema } from "../../src/lib/domain/ai/model-chain.ts";

// La tabla de esta prueba ES la decisión de diseño: cuándo tiene sentido gastar
// el siguiente modelo de la cadena y cuándo sería solo espera de más.

test("debeSaltarDeModelo: el 429 salta — es la cuota del free tier, que es justo lo que la cadena viene a sumar", () => {
  assert.strictEqual(debeSaltarDeModelo(429), true);
});

test("debeSaltarDeModelo: el 404 salta — un modelo retirado ya tumbó la IA una vez (D-087)", () => {
  assert.strictEqual(debeSaltarDeModelo(404), true);
});

test("debeSaltarDeModelo: un 5xx salta — puede ser de un modelo concreto y el salto es gratis", () => {
  assert.strictEqual(debeSaltarDeModelo(500), true);
  assert.strictEqual(debeSaltarDeModelo(503), true);
});

test("debeSaltarDeModelo: 401 y 403 NO saltan — la llave fallaría igual en todos", () => {
  assert.strictEqual(debeSaltarDeModelo(401), false);
  assert.strictEqual(debeSaltarDeModelo(403), false);
});

test("debeSaltarDeModelo: el 400 NO salta — mismo esquema, mismo rechazo; es un bug nuestro y esconderlo lo hace más difícil de ver", () => {
  assert.strictEqual(debeSaltarDeModelo(400), false);
});

test("debeSaltarDeModelo: un 200 no pide salto", () => {
  assert.strictEqual(debeSaltarDeModelo(200), false);
});

test("motivoCadenaAgotada: con dos modelos lo dice en plural y no repite el mensaje de un solo modelo", () => {
  const motivo = motivoCadenaAgotada(2);
  assert.match(motivo, /dos modelos/);
});

test("motivoCadenaAgotada: con un solo modelo no habla de varios", () => {
  const motivo = motivoCadenaAgotada(1);
  assert.doesNotMatch(motivo, /dos|todos/);
});

test("motivoCadenaAgotada: con tres o más no inventa el numeral, dice cuántos", () => {
  assert.match(motivoCadenaAgotada(3), /3 modelos/);
});

// --- Validación del esquema que se le manda al modelo -------------------------
// Escrito DESPUÉS de que producción devolviera
// «GenerateContentRequest.generation_config.response_schema.properties
//  [proposedMemoryScope].enum[8]: cannot be empty».
// Un esquema mal formado cuesta una llamada entera y un mensaje que el usuario
// no puede interpretar; se caza antes de salir a la red.

test("problemasDeEsquema: un enum con una cadena vacía se rechaza — es el 400 que llegó de producción", () => {
  const problemas = problemasDeEsquema({
    type: "OBJECT",
    properties: {
      scope: { type: "STRING", enum: ["goal", ""], format: "enum" }
    }
  });
  assert.strictEqual(problemas.length, 1);
  assert.match(problemas[0] ?? "", /scope/);
});

test("problemasDeEsquema: baja por las propiedades anidadas y por los items de un array", () => {
  assert.strictEqual(
    problemasDeEsquema({
      type: "OBJECT",
      properties: { lista: { type: "ARRAY", items: { type: "STRING", enum: [""] } } }
    }).length,
    1
  );
});

test("problemasDeEsquema: un enum vacío del todo tampoco sirve", () => {
  assert.strictEqual(problemasDeEsquema({ type: "STRING", enum: [] }).length, 1);
});

test("problemasDeEsquema: un esquema sano no da problemas", () => {
  assert.deepStrictEqual(
    problemasDeEsquema({
      type: "OBJECT",
      properties: {
        texto: { type: "STRING" },
        scope: { type: "STRING", enum: ["goal", "habit"], format: "enum" },
        ids: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: ["texto"]
    }),
    []
  );
});
