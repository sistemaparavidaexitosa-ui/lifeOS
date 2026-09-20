// src/lib/domain/agents/contrato.ts
// ¿Esto que me dan es un agente? (D-170) — lógica pura, probada en
// tests/domain/agents-registro.test.ts.
//
// POR QUÉ EXISTE
// El registro acepta objetos que vienen de otros módulos. Sin una puerta, el
// primer agente mal escrito no falla al registrarse: falla meses después, al
// ejecutarse, lejos del archivo que lo declaró y con un `undefined is not a
// function` que no dice de quién es la culpa.
//
// Misma firma que `validateAction()` de domain/automations/rules.ts —devolver
// el motivo o `null`— y por la misma razón: quien valida no decide qué hacer
// con el fallo. Allí el despachador convierte el motivo en un `skip`; aquí el
// registro lo convierte en `{ ok: false, reason }`. La función sólo sabe leer.
//
// NO se usa zod, y es deliberado: en este repo zod vive en la frontera (rutas,
// Server Actions, salida del modelo), donde el dato es ajeno y puede ser
// cualquier cosa. Un agente no es dato ajeno, es código propio que se comprueba
// al arrancar. Meter un esquema aquí pagaría el peso de un validador de
// frontera para atrapar erratas del programador.

import type { AnyAgentDefinition } from "./types.ts";

/**
 * Minúsculas, dígitos y guiones. Sin espacios, sin mayúsculas, sin puntos.
 *
 * El id va a acabar en una tabla, en un log y probablemente en una URL. Fijar
 * la forma ahora —cuando no hay ni un agente registrado— cuesta esta línea;
 * fijarla cuando existan veinte, con datos escritos, cuesta una migración.
 */
const FORMA_DEL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Un id larguísimo no rompe nada, pero delata que alguien puso ahí una frase. */
const MAX_ID = 64;

/**
 * ¿La definición tiene lo que necesita para vivir en el registro? Devuelve el
 * motivo si no, en texto pintable (D-021).
 *
 * Recibe `unknown` y no `AnyAgentDefinition` porque el valor puede venir de un
 * módulo que ni siquiera compila contra estos tipos. Una validación que exige
 * estar ya bien tipada para dejarse llamar no valida nada.
 */
export function validarAgente(candidato: unknown): string | null {
  if (typeof candidato !== "object" || candidato === null) {
    return "Un agente tiene que ser un objeto.";
  }

  const def = candidato as Partial<AnyAgentDefinition>;

  if (typeof def.id !== "string" || def.id.length === 0) {
    return "El agente no tiene identificador.";
  }
  if (def.id.length > MAX_ID) {
    return `El identificador «${def.id.slice(0, 20)}…» es demasiado largo: máximo ${MAX_ID} caracteres.`;
  }
  if (!FORMA_DEL_ID.test(def.id)) {
    return `El identificador «${def.id}» no vale: sólo minúsculas, dígitos y guiones (por ejemplo «coach-diario»).`;
  }

  if (typeof def.version !== "string" || def.version.length === 0) {
    return `El agente «${def.id}» no dice su versión.`;
  }
  if (typeof def.descripcion !== "string" || def.descripcion.trim().length === 0) {
    return `El agente «${def.id}» no dice para qué sirve.`;
  }
  if (typeof def.ejecutar !== "function") {
    return `El agente «${def.id}» no sabe ejecutarse.`;
  }

  return null;
}
