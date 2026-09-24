// src/lib/domain/centro/runtime/intencion.ts
// De una frase a un intento (D-188). Puro, probado en
// tests/domain/centro-runtime-intencion.test.ts.
//
// POR QUÉ PALABRAS Y NO UN MODELO. En Fase 1 solo hay una pantalla con datos
// («hoy»), y el Kernel —el primer camino de IA agéntica del repo— todavía no se
// ha ejecutado nunca en producción. Un clasificador de palabras se equivoca de
// formas que se pueden leer en este archivo; el día que se quede corto se
// sustituye por un `ScreenGenerator` con modelo, sin tocar a nadie más.
//
// EL ORDEN IMPORTA. «Show my money» empieza como «abre algo», pero habla de
// dinero: los temas se miran antes que el verbo. Y lo que no se entiende es
// `libre`, nunca un intento adivinado: una pantalla equivocada es peor que
// una que dice que no entendió.

import type { Intent } from "./types.ts";

export const MAX_TEXTO_INTENCION = 280;

/** Minúsculas, sin acentos ni signos: «¿Cómo?» y «como» son la misma palabra. */
function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PORTAFOLIO = /\b(accion|acciones|stocks?|tickers?|watchlist|portafolio|portfolio|mercado|bolsa)\b/;
const DINERO = /\b(dinero|money|finanzas|patrimonio|presupuesto|gastos)\b/;
const SEMANA = /\b(semana|week)\b/;
const HOY = /\b(hoy|today|dia|day)\b|que hago|what should i do/;

/**
 * «abre X», «muéstrame X», «open X»… y lo que queda es el nombre. Sobre el texto
 * ORIGINAL, no el normalizado, para devolver «Malpaso» y no «malpaso».
 */
const ABRIR =
  /^[\s¿¡]*(?:abre|abrir|mu[eé]strame|mostrar|ens[eé][nñ]ame|open|show)\s+(?:(?:el|la|los|las|mi|mis|my|the)\s+)?(?:(?:proyecto|project)\s+)?(.+?)[\s?.!]*$/i;

export function interpretarIntencion(texto: string | null): Intent {
  const crudo = (texto ?? "").slice(0, MAX_TEXTO_INTENCION).trim();
  if (!crudo) return { kind: "hoy" };

  const n = normalizar(crudo);
  if (PORTAFOLIO.test(n)) return { kind: "portafolio" };
  if (DINERO.test(n)) return { kind: "dinero" };
  if (SEMANA.test(n)) return { kind: "semana" };
  if (HOY.test(n)) return { kind: "hoy" };

  const abrir = ABRIR.exec(crudo);
  if (abrir?.[1]) return { kind: "proyecto", ref: abrir[1].trim() };

  return { kind: "libre", texto: crudo };
}
