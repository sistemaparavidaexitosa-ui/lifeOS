import { test } from "node:test";
import assert from "node:assert/strict";
import { aperturaDelCentro } from "../../src/lib/domain/comando/voz.ts";

test("domingo por la noche anticipa la semana y propone planear", () => {
  const apertura = aperturaDelCentro({
    nombre: "Luis", franja: "noche", diaSemana: 0, hayPlanDeManana: false, bloqueos: 0
  });

  assert.equal(apertura.saludo, "Luis, es domingo por la noche.");
  assert.equal(apertura.contexto, "Mañana empieza la semana.");
  assert.equal(apertura.pregunta, "¿Planeamos mañana?");
});

test("viernes por la noche reconoce el cierre de la semana", () => {
  const apertura = aperturaDelCentro({
    nombre: "Luis", franja: "noche", diaSemana: 5, hayPlanDeManana: true, bloqueos: 0
  });

  assert.equal(apertura.saludo, "Luis, es viernes por la noche.");
  assert.equal(apertura.contexto, "Se acaba la semana.");
  assert.equal(apertura.pregunta, "¿Qué quieres hacer?");
});

test("lunes por la mañana abre el día", () => {
  const apertura = aperturaDelCentro({
    nombre: "Luis", franja: "manana", diaSemana: 1, hayPlanDeManana: false, bloqueos: 0
  });

  assert.equal(apertura.saludo, "Luis, es lunes por la mañana.");
  assert.equal(apertura.contexto, "El día está por delante.");
  assert.equal(apertura.pregunta, "¿Qué quieres hacer?");
});

test("los bloqueos tienen prioridad sobre el plan de mañana", () => {
  const apertura = aperturaDelCentro({
    nombre: "Luis", franja: "noche", diaSemana: 1, hayPlanDeManana: false, bloqueos: 1
  });

  assert.equal(apertura.pregunta, "¿Quitamos lo que te frena?");
});

test("ninguna frase de la apertura queda vacía", () => {
  for (let diaSemana = 0; diaSemana < 7; diaSemana++) {
    for (const franja of ["manana", "tarde", "noche"] as const) {
      for (const hayPlanDeManana of [false, true]) {
        for (const bloqueos of [0, 1]) {
          const apertura = aperturaDelCentro({ nombre: "Luis", franja, diaSemana, hayPlanDeManana, bloqueos });
          assert.ok(apertura.saludo.length > 0);
          assert.ok(apertura.contexto.length > 0);
          assert.ok(apertura.pregunta.length > 0);
        }
      }
    }
  }
});
