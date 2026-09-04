import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dedupeFoods,
  isBarcode,
  kcalFromMacros,
  normalizeOpenFoodFacts,
  normalizeUsda,
  plausibleMacros,
  rankFoods,
  type FoodCandidate
} from "../../src/lib/domain/development/nutrition-lookup.ts";

// Aquí se decide qué es un buen candidato. La red no decide nada: trae JSON y
// esto dice qué se guarda y qué se tira.

test("isBarcode: acepta EAN-8/12/13/14 y devuelve el código limpio", () => {
  assert.strictEqual(isBarcode("3017620422003"), "3017620422003");
  assert.strictEqual(isBarcode("96385074"), "96385074");
});

test("isBarcode: limpia espacios y guiones, como cleanIsbn", () => {
  assert.strictEqual(isBarcode(" 3017-6204 22003 "), "3017620422003");
});

test("isBarcode: el texto con dígitos NO es un código de barras", () => {
  assert.strictEqual(isBarcode("avena 100"), null);
  assert.strictEqual(isBarcode("12345"), null);
});

test("kcalFromMacros: rellena las kcal con 4/4/9 cuando el proveedor no las trae", () => {
  assert.strictEqual(kcalFromMacros({ proteinG: 10, carbsG: 20, fatG: 5 }), 165);
});

test("plausibleMacros: rechaza más de 900 kcal por 100 g — no existe el alimento", () => {
  assert.strictEqual(plausibleMacros({ kcal: 1200, proteinG: 0, carbsG: 0, fatG: 100 }), false);
});

test("plausibleMacros: ACEPTA el aceite de oliva (884 kcal, 100 g de grasa)", () => {
  assert.strictEqual(plausibleMacros({ kcal: 884, proteinG: 0, carbsG: 0, fatG: 100 }), true);
});

test("plausibleMacros: rechaza cuando 4P+4C+9F se aleja del declarado más de lo que explica la fibra", () => {
  // 10/10/10 son 170 kcal por la fórmula; declarar 600 es un dato roto.
  assert.strictEqual(plausibleMacros({ kcal: 600, proteinG: 10, carbsG: 10, fatG: 10 }), false);
});

test("plausibleMacros: tolera el desvío de la fibra y los polioles, que OFF no descuenta", () => {
  assert.strictEqual(plausibleMacros({ kcal: 200, proteinG: 10, carbsG: 10, fatG: 10 }), true);
});

test("normalizeUsda: lee los nutrientes por número (208/203/205/204)", () => {
  const [c] = normalizeUsda([
    {
      fdcId: 171077,
      description: "Chicken, breast, raw",
      foodNutrients: [
        { nutrientNumber: "208", value: 120 },
        { nutrientNumber: "203", value: 22.5 },
        { nutrientNumber: "205", value: 0 },
        { nutrientNumber: "204", value: 2.6 }
      ]
    }
  ]);
  assert.strictEqual(c.source, "usda");
  assert.strictEqual(c.sourceRef, "171077");
  assert.strictEqual(c.per100g.kcal, 120);
  assert.strictEqual(c.per100g.proteinG, 22.5);
});

test("normalizeUsda: descarta el alimento sin energía en vez de inventarle 0 kcal", () => {
  const salida = normalizeUsda([{ fdcId: 1, description: "Agua", foodNutrients: [{ nutrientNumber: "203", value: 0 }] }]);
  assert.deepStrictEqual(salida, []);
});

test("normalizeOpenFoodFacts: usa energy-kcal_100g y NO energy_100g, que viene en kJ", () => {
  const [c] = normalizeOpenFoodFacts([
    {
      code: "3017620422003",
      product_name: "Nutella",
      brands: "Ferrero",
      nutriments: { "energy-kcal_100g": 539, energy_100g: 2255, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 }
    }
  ]);
  assert.strictEqual(c.per100g.kcal, 539);
  assert.strictEqual(c.brand, "Ferrero");
});

test("normalizeOpenFoodFacts: un producto sin nombre se descarta", () => {
  const salida = normalizeOpenFoodFacts([{ code: "1", product_name: "", nutriments: { "energy-kcal_100g": 100 } }]);
  assert.deepStrictEqual(salida, []);
});

test("normalizeOpenFoodFacts: sin serving_quantity, servingG queda en null y no en 0", () => {
  const [c] = normalizeOpenFoodFacts([
    { code: "1", product_name: "Algo", nutriments: { "energy-kcal_100g": 100, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } }
  ]);
  assert.strictEqual(c.servingG, null);
});

function cand(over: Partial<FoodCandidate> = {}): FoodCandidate {
  return {
    source: "off",
    sourceRef: "1",
    name: "Yogur natural",
    brand: "Gloria",
    per100g: { kcal: 60, proteinG: 3.5, carbsG: 4.7, fatG: 3.2 },
    servingG: null,
    servingLabel: "",
    ...over
  };
}

test("dedupeFoods: ante el mismo (source, sourceRef) conserva el que trae más datos", () => {
  const salida = dedupeFoods([cand({ servingG: null }), cand({ servingG: 125, servingLabel: "1 vaso" })]);
  assert.strictEqual(salida.length, 1);
  assert.strictEqual(salida[0].servingG, 125);
});

test("dedupeFoods: NO colapsa dos productos distintos de la misma marca", () => {
  const salida = dedupeFoods([cand({ sourceRef: "1" }), cand({ sourceRef: "2", name: "Yogur griego" })]);
  assert.strictEqual(salida.length, 2);
});

test("rankFoods: el que empieza por el término va antes que el que solo lo contiene", () => {
  const salida = rankFoods([cand({ sourceRef: "1", name: "Leche de avena" }), cand({ sourceRef: "2", name: "Avena en hojuelas" })], "avena");
  assert.strictEqual(salida[0].name, "Avena en hojuelas");
});
