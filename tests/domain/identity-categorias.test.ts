import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AREAS,
  CATEGORIAS,
  areaDe,
  areaDeCategoria,
  categoriaDe,
  type Area
} from "../../src/lib/domain/identity/categorias.ts";

test("areaDeCategoria: el mapeo es TOTAL y siempre cae en una de las siete áreas", () => {
  // Es el invariante que impide la deriva: en cuanto una categoría no proyecte
  // a un área, el radar y el «equilibrio» del Identity Score dejan de cuadrar
  // con lo que dice el brief.
  for (const categoria of CATEGORIAS) {
    const area = areaDeCategoria(categoria);
    assert.ok(AREAS.includes(area), `«${categoria}» proyecta a «${area}», que no es un área`);
  }
});

test("areaDeCategoria: las agrupaciones que no son obvias", () => {
  assert.equal(areaDeCategoria("Negocio"), "Carrera");
  assert.equal(areaDeCategoria("Liderazgo"), "Carrera");
  assert.equal(areaDeCategoria("Disciplina"), "Personal");
  assert.equal(areaDeCategoria("Confianza"), "Personal");
  assert.equal(areaDeCategoria("Propósito"), "Espiritual");
  assert.equal(areaDeCategoria("Dinero"), "Finanzas");
});

test("categoriaDe: tolera el acento perdido y las mayúsculas, pero no adivina", () => {
  assert.equal(categoriaDe("Propósito"), "Propósito");
  assert.equal(categoriaDe("proposito"), "Propósito");
  assert.equal(categoriaDe("PROPÓSITO"), "Propósito");
  assert.equal(categoriaDe("  dinero  "), "Dinero");

  // «Éxito» no es ninguna de las once. Devolver null la manda al grupo
  // «Otras», que es honesto; adivinarle una categoría la escondería en el
  // grupo equivocado.
  assert.equal(categoriaDe("Éxito"), null);
  assert.equal(categoriaDe(""), null);
  assert.equal(categoriaDe(null), null);
  assert.equal(categoriaDe(undefined), null);
});

test("areaDe: misma tolerancia, mismo rechazo", () => {
  assert.equal(areaDe("espiritual"), "Espiritual");
  assert.equal(areaDe("Finanzas"), "Finanzas");
  assert.equal(areaDe("Productividad"), null);
  assert.equal(areaDe(undefined), null);
});

test("las áreas son exactamente las siete de 0064", () => {
  const esperadas: Area[] = ["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"];
  assert.deepEqual([...AREAS], esperadas);
});

test("las categorías son once y no se repiten", () => {
  assert.equal(CATEGORIAS.length, 11);
  assert.equal(new Set(CATEGORIAS).size, 11);
});
