import { test } from "node:test";
import assert from "node:assert/strict";
import { tocaFotoDeIdentidad, HORA_FOTO_IDENTIDAD, HORA_BRIEF_DEL_DIA, tocaBriefDelDia } from "../../src/lib/domain/identity/schedule.ts";

test("tocaFotoDeIdentidad: solo en la última hora del día local", () => {
  assert.equal(tocaFotoDeIdentidad("22:59"), false);
  assert.equal(tocaFotoDeIdentidad("23:00"), true);
  assert.equal(tocaFotoDeIdentidad("23:55"), true);
  assert.equal(tocaFotoDeIdentidad("00:05"), false);
});

test("el brief del día se escribe en la hora de las cuatro, no antes ni después", () => {
  // Después de medianoche, porque el brief es de HOY; y antes de que nadie
  // madrugue, que es el objetivo entero.
  assert.equal(tocaBriefDelDia("04:00"), true);
  assert.equal(tocaBriefDelDia("04:55"), true);
  assert.equal(tocaBriefDelDia("03:59"), false);
  assert.equal(tocaBriefDelDia("05:00"), false);
  // La hora entera da doce pasadas del reloj de margen, que es justo lo que
  // hace falta cuando el agente tarda un minuto en despertar.
  assert.equal(HORA_BRIEF_DEL_DIA, 4);
});

test("la foto de identidad y el brief no se pisan", () => {
  // Si cayeran en la misma hora, la pasada tendría dos trabajos con modelo
  // compitiendo por el mismo presupuesto.
  assert.notEqual(HORA_FOTO_IDENTIDAD, HORA_BRIEF_DEL_DIA);
});
