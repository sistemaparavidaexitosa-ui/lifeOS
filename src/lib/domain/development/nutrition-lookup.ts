// src/lib/domain/development/nutrition-lookup.ts
// Normalización de lo que devuelven FoodData Central (USDA) y Open Food Facts.
// Puro y espejo de `book-lookup.ts`: toda la decisión de «qué es un buen
// candidato» vive aquí, la red solo trae JSON.
//
// Las dos APIs describen lo mismo de formas distintas —USDA por números de
// nutriente, OFF por claves con sufijo— y las dos mienten de vez en cuando.
// Este archivo es donde se les pone el filtro.

import type { Macros } from "./nutrition.ts";

export interface FoodCandidate {
  source: "usda" | "off";
  /** `fdcId` en USDA, código de barras en OFF. */
  sourceRef: string;
  name: string;
  brand: string;
  /** SIEMPRE por 100 g. Es la unidad canónica del módulo. */
  per100g: Macros;
  /** `null` —no 0— cuando el proveedor no la trae: son cosas distintas. */
  servingG: number | null;
  servingLabel: string;
}

const unDecimal = (n: number) => Math.round(n * 10) / 10;

/**
 * El texto es un código de barras, ya limpio, o `null`.
 *
 * Se comprueba antes de buscar porque cambia el destino de la consulta: un
 * código va SOLO a Open Food Facts. USDA no sabe de códigos de barras, y
 * llamarlo sería gastar cuota a cambio de nada.
 */
export function isBarcode(raw: string): string | null {
  const limpio = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(limpio)) return null;
  return [8, 12, 13, 14].includes(limpio.length) ? limpio : null;
}

/** Las kcal por la fórmula de Atwater, para cuando el proveedor no las trae. */
export function kcalFromMacros(m: Omit<Macros, "kcal">): number {
  return Math.round(4 * m.proteinG + 4 * m.carbsG + 9 * m.fatG);
}

/** Ningún alimento pasa de aquí: la grasa pura son 884 kcal/100 g. */
const KCAL_MAX_100G = 900;

/**
 * Cuánto puede alejarse lo declarado de lo que dan los macros.
 *
 * **Ancho a propósito.** Open Food Facts es colaborativo y sus fichas traen
 * fibra, alcohol y polioles que la fórmula 4/4/9 no descuenta, así que un
 * margen estrecho tumbaría alimentos reales. Esto no busca la etiqueta
 * perfecta: busca la fila rota.
 */
const DESVIO_MAX = 0.3;

/**
 * El guardián de la tabla global: lo que no pase de aquí no se guarda en
 * `foods` ni se le enseña al usuario.
 */
export function plausibleMacros(per100g: Macros): boolean {
  const { kcal, proteinG, carbsG, fatG } = per100g;
  if (![kcal, proteinG, carbsG, fatG].every((n) => Number.isFinite(n) && n >= 0)) return false;
  if (kcal <= 0 || kcal > KCAL_MAX_100G) return false;
  if (proteinG > 100 || carbsG > 100 || fatG > 100) return false;

  const calculadas = kcalFromMacros({ proteinG, carbsG, fatG });
  return Math.abs(calculadas - kcal) / kcal <= DESVIO_MAX;
}

// --- USDA --------------------------------------------------------------------

/**
 * Números de nutriente de USDA. Son estables y NO son los `nutrientId`: la
 * misma respuesta trae los dos y confundirlos devuelve otro nutriente.
 */
const USDA = { kcal: "208", proteina: "203", carbos: "205", grasa: "204" } as const;

export interface UsdaFood {
  fdcId: number;
  description?: string;
  brandOwner?: string;
  foodNutrients?: { nutrientNumber?: string; value?: number }[];
}

/**
 * Solo se consultan los conjuntos Foundation y SR Legacy, que vienen **siempre
 * por 100 g**: por eso aquí no hay ningún reescalado, y añadir `Branded` sin
 * tocar esto metería porciones disfrazadas de 100 g.
 */
export function normalizeUsda(foods: readonly UsdaFood[]): FoodCandidate[] {
  const salida: FoodCandidate[] = [];
  for (const f of foods) {
    const valor = (numero: string) => f.foodNutrients?.find((n) => n.nutrientNumber === numero)?.value;
    const kcal = valor(USDA.kcal);
    const nombre = (f.description ?? "").trim();
    // Sin energía no hay alimento que registrar. Ponerle 0 kcal sería peor que
    // no ofrecerlo: entraría en el diario y bajaría el total del día.
    if (kcal === undefined || !nombre) continue;

    salida.push({
      source: "usda",
      sourceRef: String(f.fdcId),
      name: nombre,
      brand: (f.brandOwner ?? "").trim(),
      per100g: {
        kcal: Math.round(kcal),
        proteinG: unDecimal(valor(USDA.proteina) ?? 0),
        carbsG: unDecimal(valor(USDA.carbos) ?? 0),
        fatG: unDecimal(valor(USDA.grasa) ?? 0)
      },
      servingG: null,
      servingLabel: ""
    });
  }
  return salida;
}

// --- Open Food Facts ---------------------------------------------------------

export interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

const numero = (v: number | string | undefined): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

export function normalizeOpenFoodFacts(products: readonly OffProduct[]): FoodCandidate[] {
  const salida: FoodCandidate[] = [];
  for (const p of products) {
    const nombre = (p.product_name ?? "").trim();
    const code = (p.code ?? "").trim();
    if (!nombre || !code) continue;

    const n = p.nutriments ?? {};
    // `energy-kcal_100g` y NO `energy_100g`: el segundo viene en kJ y usarlo
    // multiplica por 4,18 todo lo que el usuario registre.
    const proteinG = unDecimal(numero(n["proteins_100g"]) ?? 0);
    const carbsG = unDecimal(numero(n["carbohydrates_100g"]) ?? 0);
    const fatG = unDecimal(numero(n["fat_100g"]) ?? 0);
    const kcal = numero(n["energy-kcal_100g"]) ?? kcalFromMacros({ proteinG, carbsG, fatG });

    const porcion = numero(p.serving_quantity);
    salida.push({
      source: "off",
      sourceRef: code,
      name: nombre,
      brand: ((p.brands ?? "").split(",")[0] ?? "").trim(),
      per100g: { kcal: Math.round(kcal), proteinG, carbsG, fatG },
      // `null` y no 0: «no lo sé» y «pesa cero» no son lo mismo, y un 0 aquí
      // haría que el botón «1 porción» registrara nada.
      servingG: porcion && porcion > 0 ? porcion : null,
      servingLabel: (p.serving_size ?? "").trim()
    });
  }
  return salida;
}

// --- Mezcla ------------------------------------------------------------------

/** Cuántos campos útiles trae un candidato. Desempata en el dedupe. */
function riqueza(c: FoodCandidate): number {
  return (c.brand ? 1 : 0) + (c.servingG ? 1 : 0) + (c.servingLabel ? 1 : 0);
}

/**
 * Uno por `(source, sourceRef)`, quedándose con el más completo.
 *
 * **No se deduplica por nombre**, a diferencia de `dedupeByTitle` en los
 * libros: dos yogures de la misma marca con el mismo nombre y distinto código
 * son productos distintos —tamaños, sabores— con macros distintos, y
 * colapsarlos haría que el usuario registrara el que no era.
 */
export function dedupeFoods(candidates: readonly FoodCandidate[]): FoodCandidate[] {
  const porClave = new Map<string, FoodCandidate>();
  for (const c of candidates) {
    const clave = `${c.source}:${c.sourceRef}`;
    const previo = porClave.get(clave);
    if (!previo || riqueza(c) > riqueza(previo)) porClave.set(clave, c);
  }
  return [...porClave.values()];
}

/**
 * Orden de presentación: primero lo que empieza por lo buscado, luego lo que lo
 * contiene, y a igualdad el dato curado (USDA) antes que el colaborativo (OFF).
 */
export function rankFoods(candidates: readonly FoodCandidate[], query: string): FoodCandidate[] {
  const q = query.trim().toLowerCase();
  const puntua = (c: FoodCandidate) => {
    const nombre = c.name.toLowerCase();
    if (q && nombre.startsWith(q)) return 0;
    if (q && nombre.includes(q)) return 1;
    return 2;
  };
  return [...candidates].sort((a, b) => {
    const d = puntua(a) - puntua(b);
    if (d !== 0) return d;
    if (a.source !== b.source) return a.source === "usda" ? -1 : 1;
    return a.name.localeCompare(b.name, "es");
  });
}
