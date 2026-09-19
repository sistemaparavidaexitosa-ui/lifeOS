// tests/domain/ritual-policy.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverAjustes, pasosOfrecibles, POLITICA_POR_DEFECTO, PREFERENCIA_POR_DEFECTO } from "../../src/lib/domain/ritual/policy.ts";
import { PASOS_RITUAL, type RitualPolicy, type RitualPreference, type TipoPaso } from "../../src/lib/domain/ritual/types.ts";

function politica(p: Partial<RitualPolicy> = {}): RitualPolicy {
  return { ...POLITICA_POR_DEFECTO, enabled: true, ...p };
}
function preferencia(f: Partial<RitualPreference> = {}): RitualPreference {
  return { ...PREFERENCIA_POR_DEFECTO, ...f };
}

test("La política por defecto nace apagada, igual que la fila sembrada en 0068", () => {
  assert.strictEqual(POLITICA_POR_DEFECTO.enabled, false);
});

test("Sin fila de preferencia se respeta la política entera", () => {
  const p = politica({ steps: ["greeting", "affirmation", "routineStep"] });
  const r = resolverAjustes(p, PREFERENCIA_POR_DEFECTO);
  assert.strictEqual(r.enabled, true);
  assert.deepStrictEqual(r.steps, ["greeting", "affirmation", "routineStep"]);
});

test("El usuario apaga un paso que el administrador encendió", () => {
  const r = resolverAjustes(
    politica({ steps: ["greeting", "affirmation", "routineStep"] }),
    preferencia({ stepsOff: ["affirmation"] })
  );
  assert.deepStrictEqual(r.steps, ["greeting", "routineStep"]);
});

test("El usuario NO puede encender un paso que el administrador apagó", () => {
  // `stepsOff` nombra un paso que la política ni siquiera ofrece: no puede
  // añadirlo por la puerta de atrás, y tampoco debe romper nada.
  const r = resolverAjustes(
    politica({ steps: ["greeting"] }),
    preferencia({ stepsOff: ["context", "planToday"] })
  );
  assert.deepStrictEqual(r.steps, ["greeting"]);
});

test("Con la política apagada, el usuario no puede encender el ritual", () => {
  const r = resolverAjustes(politica({ enabled: false }), preferencia({ enabled: true }));
  assert.strictEqual(r.enabled, false);
});

test("Con la IA apagada por el administrador, el usuario no puede encenderla", () => {
  const r = resolverAjustes(politica({ aiEnabled: false }), preferencia({ aiEnabled: true }));
  assert.strictEqual(r.aiEnabled, false);
});

test("El usuario sí puede apagar el ritual entero y la IA", () => {
  const r = resolverAjustes(politica({ aiEnabled: true }), preferencia({ enabled: false, aiEnabled: false }));
  assert.strictEqual(r.enabled, false);
  assert.strictEqual(r.aiEnabled, false);
});

test("Lo que no es del usuario lo sigue mandando la política", () => {
  const p = politica({ windowStart: 5, windowEnd: 10, frequency: "Entre semana", blocking: false, maxRoutineSteps: 3 });
  const r = resolverAjustes(p, preferencia({ enabled: false }));
  assert.strictEqual(r.windowStart, 5);
  assert.strictEqual(r.windowEnd, 10);
  assert.strictEqual(r.frequency, "Entre semana");
  assert.strictEqual(r.blocking, false);
  assert.strictEqual(r.maxRoutineSteps, 3);
});

// ---------------------------------------------------------------------------
// LA REGLA DURA, COMO PROPIEDAD
//
// «El usuario puede apagar lo que el administrador encendió, NUNCA al revés» es
// una conjunción monótona, y por eso se puede demostrar sobre una matriz de
// combinaciones en vez de con una lista de casos que siempre deja uno fuera.
// Si alguien convierte `steps_off` en `steps_on`, esto se pone rojo.
// ---------------------------------------------------------------------------
test("PROPIEDAD: resolver nunca añade nada que la política no ofreciera", () => {
  const subconjuntos: TipoPaso[][] = [
    [],
    ["greeting"],
    ["greeting", "affirmation"],
    ["affirmation", "routineStep", "context"],
    [...PASOS_RITUAL]
  ];
  const booleanos = [true, false];
  let combinaciones = 0;

  for (const steps of subconjuntos) {
    for (const stepsOff of subconjuntos) {
      for (const pEnabled of booleanos) {
        for (const fEnabled of booleanos) {
          for (const pAi of booleanos) {
            for (const fAi of booleanos) {
              const p = politica({ enabled: pEnabled, aiEnabled: pAi, steps });
              const f = preferencia({ enabled: fEnabled, aiEnabled: fAi, stepsOff });
              const r = resolverAjustes(p, f);
              combinaciones++;

              for (const paso of r.steps) {
                assert.ok(steps.includes(paso), `resolver añadió «${paso}», que la política no ofrecía`);
              }
              for (const paso of stepsOff) {
                assert.ok(!r.steps.includes(paso), `resolver dejó «${paso}», que el usuario había apagado`);
              }
              assert.strictEqual(r.enabled, pEnabled && fEnabled);
              assert.strictEqual(r.aiEnabled, pAi && fAi);
            }
          }
        }
      }
    }
  }

  assert.strictEqual(combinaciones, 400);
});

test("pasosOfrecibles es lo único que /settings puede pintar", () => {
  const p = politica({ steps: ["greeting", "context"] });
  assert.deepStrictEqual(pasosOfrecibles(p), ["greeting", "context"]);
});

test("pasosOfrecibles respeta el orden narrativo, no el de la fila", () => {
  // El administrador puede haber guardado el array en cualquier orden; la
  // pantalla de ajustes tiene que leerse siempre igual.
  const p = politica({ steps: ["planToday", "greeting", "affirmation"] });
  assert.deepStrictEqual(pasosOfrecibles(p), ["greeting", "affirmation", "planToday"]);
});

test("Un paso desconocido guardado por una versión futura se ignora", () => {
  const p = politica({ steps: ["greeting", "paso-del-futuro" as TipoPaso] });
  assert.deepStrictEqual(resolverAjustes(p, PREFERENCIA_POR_DEFECTO).steps, ["greeting"]);
});
