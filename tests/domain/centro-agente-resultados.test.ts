import { test } from "node:test";
import assert from "node:assert/strict";
import { resumirResultados, MAX_LINEAS_RESULTADOS } from "../../src/lib/domain/centro/agente/resultados.ts";

test("Agrupa propuestas por tipo o por tabla+operación, con guardadas y descartadas", () => {
  const l = resumirResultados({
    propuestas: [
      { tipo: "cambio", status: "accepted", tabla: "food_entries", operacion: "crear" },
      { tipo: "cambio", status: "accepted", tabla: "food_entries", operacion: "crear" },
      { tipo: "cambio", status: "dismissed", tabla: "food_entries", operacion: "crear" },
      { tipo: "bloque", status: "dismissed" },
      { tipo: "bloque", status: "dismissed" }
    ],
    correcciones: [],
    entendimiento: []
  });
  assert.deepStrictEqual(l, [
    "Crear · Comida: guardaste 2, descartaste 1.",
    "Bloque de tiempo: guardaste 0, descartaste 2."
  ]);
});

test("Correcciones por campo con su etiqueta, y los malentendidos", () => {
  const l = resumirResultados({
    propuestas: [],
    correcciones: [{ tabla: "food_entries", campos: ["grams"] }, { tabla: "food_entries", campos: ["grams", "meal"] }],
    entendimiento: [
      { resultado: "malentendido", tabla: "tasks", operacion: "editar" },
      { resultado: "seguir" },
      { resultado: "seguir" },
      { resultado: "alternativa" }
    ]
  });
  // Orden por volumen: confirmaciones (3) > «Gramos» (2) > el resto (1), y a
  // igual volumen, en el orden en que se arman.
  assert.deepStrictEqual(l, [
    "Confirmaste que te entendí 2 veces; elegiste otra opción 1 vez.",
    "Corregiste «Gramos» (Comida) 2 veces antes de guardar.",
    "Corregiste «Comida» (Comida) 1 vez antes de guardar.",
    "Me dijiste «No es esto» 1 vez (Cambiar · Tarea)."
  ]);
});

test("Nunca más de 12 líneas; vacío si no hay nada", () => {
  const propuestas = Array.from({ length: 30 }, (_, i) => ({ tipo: `t${i}`, status: "accepted" as const }));
  assert.strictEqual(resumirResultados({ propuestas, correcciones: [], entendimiento: [] }).length, MAX_LINEAS_RESULTADOS);
  assert.deepStrictEqual(resumirResultados({ propuestas: [], correcciones: [], entendimiento: [] }), []);
});
