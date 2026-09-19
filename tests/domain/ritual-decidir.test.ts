// tests/domain/ritual-decidir.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { debeMostrarseHoy, dentroDeVentana, type EntradaDecision } from "../../src/lib/domain/ritual/decidir.ts";
import { POLITICA_POR_DEFECTO } from "../../src/lib/domain/ritual/policy.ts";
import type { RitualSettings } from "../../src/lib/domain/ritual/types.ts";

// 2026-09-19 es sábado; 2026-09-21 es lunes; 2026-09-23 es miércoles.

function ajustes(p: Partial<RitualSettings> = {}): RitualSettings {
  return { ...POLITICA_POR_DEFECTO, enabled: true, ...p };
}

function entrada(e: Partial<EntradaDecision> = {}): EntradaDecision {
  return {
    settings: ajustes(),
    dateISO: "2026-09-23",
    hourLocal: 6,
    yaHayEjecucionHoy: false,
    hayContenido: true,
    ...e
  };
}

test("dentroDeVentana: el arranque abre en la hora de inicio y cierra ANTES de la de fin", () => {
  assert.strictEqual(dentroDeVentana(3, 4, 12), false);
  assert.strictEqual(dentroDeVentana(4, 4, 12), true);
  assert.strictEqual(dentroDeVentana(11, 4, 12), true);
  // Las 12:00 ya no: la ventana es [inicio, fin), como todos los rangos del repo.
  assert.strictEqual(dentroDeVentana(12, 4, 12), false);
});

test("El caso normal: dentro de ventana, con contenido y sin haberlo visto", () => {
  const r = debeMostrarseHoy(entrada());
  assert.strictEqual(r.mostrar, true);
  assert.strictEqual(r.motivo, null);
});

test("Con la política apagada no se muestra, y lo dice", () => {
  const r = debeMostrarseHoy(entrada({ settings: ajustes({ enabled: false }) }));
  assert.strictEqual(r.mostrar, false);
  assert.strictEqual(r.motivo, "politica_apagada");
});

test("Fuera de la ventana horaria no se muestra", () => {
  const r = debeMostrarseHoy(entrada({ hourLocal: 20 }));
  assert.strictEqual(r.mostrar, false);
  assert.strictEqual(r.motivo, "fuera_de_ventana");
});

test("Un sábado con frecuencia «Entre semana» no toca", () => {
  const r = debeMostrarseHoy(entrada({ settings: ajustes({ frequency: "Entre semana" }), dateISO: "2026-09-19" }));
  assert.strictEqual(r.mostrar, false);
  assert.strictEqual(r.motivo, "no_toca_hoy");
});

test("Con frecuencia «Semanal» solo toca el lunes, igual que las rutinas", () => {
  assert.strictEqual(debeMostrarseHoy(entrada({ settings: ajustes({ frequency: "Semanal" }), dateISO: "2026-09-21" })).mostrar, true);
  assert.strictEqual(debeMostrarseHoy(entrada({ settings: ajustes({ frequency: "Semanal" }), dateISO: "2026-09-23" })).motivo, "no_toca_hoy");
});

test("Si ya hay ejecución de hoy no se vuelve a mostrar", () => {
  const r = debeMostrarseHoy(entrada({ yaHayEjecucionHoy: true }));
  assert.strictEqual(r.mostrar, false);
  assert.strictEqual(r.motivo, "ya_visto");
});

test("Sin contenido real no se muestra: un saludo solo no es un ritual", () => {
  const r = debeMostrarseHoy(entrada({ hayContenido: false }));
  assert.strictEqual(r.mostrar, false);
  assert.strictEqual(r.motivo, "sin_contenido");
});

test("Sin pasos permitidos tampoco se muestra", () => {
  const r = debeMostrarseHoy(entrada({ settings: ajustes({ steps: [] }) }));
  assert.strictEqual(r.mostrar, false);
  assert.strictEqual(r.motivo, "sin_contenido");
});

test("El motivo es el PRIMERO que aplica, para que el diagnóstico no engañe", () => {
  // Con todo mal a la vez, el motivo que se devuelve es el más de fondo: si la
  // política está apagada, decir «fuera de ventana» mandaría al administrador a
  // cambiar el horario de algo que ni siquiera está encendido.
  const r = debeMostrarseHoy(
    entrada({ settings: ajustes({ enabled: false }), hourLocal: 23, yaHayEjecucionHoy: true, hayContenido: false })
  );
  assert.strictEqual(r.motivo, "politica_apagada");
});

test("«Ya visto» pesa más que «sin contenido»: no se recalcula lo que no se va a pintar", () => {
  const r = debeMostrarseHoy(entrada({ yaHayEjecucionHoy: true, hayContenido: false }));
  assert.strictEqual(r.motivo, "ya_visto");
});
