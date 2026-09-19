// src/lib/domain/ritual/contexto.ts
// Qué cifras del día merecen un hueco en el paso de contexto (D-165), probado
// en tests/domain/ritual-contexto.test.ts.
//
// CERO FORMATO. Aquí solo hay números, y quien los escribe con su moneda, su
// signo y su idioma es la pantalla. Es la misma frontera que respeta el resto
// del repo: el dominio calcula, la vista redacta.

import type { HechoRitual } from "./types.ts";

/**
 * A partir de aquí el día ya viene apretado y vale la pena decirlo.
 *
 * Por debajo NO se pinta, y es deliberado: un ritual que informa de que el 40 %
 * del día está ocupado gasta una de sus pocas líneas en una obviedad.
 */
export const UMBRAL_SATURACION = 90;

export interface EntradaContexto {
  liquidez: number;
  presupuestoRestante: number;
  /**
   * Por qué es un campo propio y no se deduce de `presupuestoRestante === 0`:
   * «te quedan cero» y «no tienes presupuesto» son cosas distintas y con un solo
   * número no se distinguen. Inventar la primera cuando pasa la segunda es
   * exactamente lo que prohíbe el guardrail NO-MOCK.
   */
  hayPresupuesto: boolean;
  vencidas: number;
  impacto: number;
  saturacionPct: number;
  recordatoriosHoy: number;
}

/**
 * Los hechos del día, en el orden en que se pintan: lo urgente primero, lo
 * informativo después, el dinero al final.
 *
 * REGLA GENERAL: una cifra en cero no es una noticia. Los conteos solo producen
 * hecho si son mayores que cero — si no, el paso de contexto se llenaría de
 * ceros que no dicen nada y empujarían fuera lo que sí importa.
 *
 * El dinero es la excepción y sí sale siempre: saber cuánto hay es el dato que
 * la persona vino a mirar, valga lo que valga.
 */
export function hechosDeContexto(e: EntradaContexto): HechoRitual[] {
  const hechos: HechoRitual[] = [];

  if (e.vencidas > 0) {
    hechos.push({ id: "vencidas", etiqueta: "Tareas vencidas", valor: e.vencidas, unidad: "conteo", tono: "bad" });
  }

  if (e.saturacionPct >= UMBRAL_SATURACION) {
    hechos.push({
      id: "saturacion",
      etiqueta: "Del día ya está ocupado",
      valor: e.saturacionPct,
      unidad: "porcentaje",
      tono: "warn"
    });
  }

  if (e.impacto > 0) {
    hechos.push({ id: "impacto", etiqueta: "Tareas de impacto", valor: e.impacto, unidad: "conteo", tono: "info" });
  }

  if (e.recordatoriosHoy > 0) {
    hechos.push({
      id: "recordatorios",
      etiqueta: "Recordatorios para hoy",
      valor: e.recordatoriosHoy,
      unidad: "conteo",
      tono: "info"
    });
  }

  hechos.push({
    id: "liquidez",
    etiqueta: "Disponible",
    valor: e.liquidez,
    unidad: "moneda",
    // En negativo es una mala noticia, no un dato neutro: pintarlo del mismo
    // color que un saldo sano es esconderlo.
    tono: e.liquidez < 0 ? "bad" : "info"
  });

  if (e.hayPresupuesto) {
    hechos.push({
      id: "presupuesto",
      etiqueta: "Queda de la quincena",
      valor: e.presupuestoRestante,
      unidad: "moneda",
      tono: e.presupuestoRestante < 0 ? "bad" : "ok"
    });
  }

  return hechos;
}
