import "server-only";
import { z } from "zod";
import { requireUsdaApiKey } from "@/config/env";
import {
  dedupeFoods,
  isBarcode,
  normalizeOpenFoodFacts,
  normalizeUsda,
  plausibleMacros,
  rankFoods,
  type FoodCandidate
} from "@/lib/domain/development/nutrition-lookup.ts";

/**
 * Alimentos desde FoodData Central (USDA) y Open Food Facts (§B3 del diseño).
 * Calco de `books.ts`, que resuelve el mismo problema con Open Library y
 * Google Books: `fetch` directo, sin SDK, sin tocar Supabase.
 *
 * REGLA DE ORO, la misma que `sendEmail()` y `books.ts` (D-021): **nunca
 * lanza**. Un proveedor caído, una respuesta con otra forma o un timeout
 * devuelven `{ ok: false, reason }` y el usuario captura el alimento a mano.
 * Una integración opcional no puede tumbar el diario.
 *
 * POR QUÉ DOS PROVEEDORES Y NO UNO. Cubren cosas distintas: USDA trae el
 * alimento genérico —«pechuga de pollo», «arroz cocido»— con datos de
 * laboratorio, y OFF trae la marca y el código de barras. Con uno solo, la
 * mitad de lo que come cualquiera no se encuentra.
 */

export interface FoodLookupResult {
  ok: boolean;
  candidates: FoodCandidate[];
  /** Motivo legible cuando `ok` es false. La UI lo muestra tal cual. */
  reason?: string;
}

/** Ninguna búsqueda de alimentos justifica dejar una petición colgada. */
const TIMEOUT_MS = 6000;
const MAX_RESULTS = 8;

/**
 * Open Food Facts EXIGE un User-Agent propio con contacto, y no es una
 * formalidad: incumplirlo se castiga con bloqueo de la IP.
 */
const OFF_USER_AGENT = "LifeOS/0.1 (https://github.com/sistemaparavidaexitosa-ui)";

const usdaSchema = z.object({
  foods: z
    .array(
      z.object({
        fdcId: z.number(),
        description: z.string().optional(),
        brandOwner: z.string().optional(),
        foodNutrients: z
          .array(z.object({ nutrientNumber: z.string().optional(), value: z.number().optional() }))
          .optional()
      })
    )
    .default([])
});

const offProductoSchema = z.object({
  code: z.string().optional(),
  product_name: z.string().optional(),
  brands: z.string().optional(),
  serving_quantity: z.union([z.number(), z.string()]).optional(),
  serving_size: z.string().optional(),
  nutriments: z.record(z.union([z.number(), z.string()])).optional()
});

const offUnoSchema = z.object({ product: offProductoSchema.optional() });
const offBusquedaSchema = z.object({ products: z.array(offProductoSchema).default([]) });

/**
 * Un GET que devuelve `null` ante CUALQUIER problema. Igual que en `books.ts`:
 * quien llama solo necesita saber «este proveedor no contestó», y distinguir
 * un 500 de un timeout no cambiaría nada de lo que se hace después.
 */
async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function searchUsda(term: string): Promise<FoodCandidate[] | null> {
  let key: string;
  try {
    key = requireUsdaApiKey();
  } catch {
    // Sin llave este proveedor sencillamente no existe. No es un error que
    // haya que enseñar: OFF sigue contestando.
    return null;
  }

  // Foundation y SR Legacy vienen SIEMPRE por 100 g, que es lo que permite que
  // `normalizeUsda` no reescale nada. Añadir `Branded` aquí sin tocar el
  // normalizador metería porciones disfrazadas de 100 g.
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(term)}&dataType=${encodeURIComponent("Foundation,SR Legacy")}&pageSize=${MAX_RESULTS}`;

  const raw = await getJson(url);
  if (!raw) return null;
  const parsed = usdaSchema.safeParse(raw);
  if (!parsed.success) return null;
  return normalizeUsda(parsed.data.foods);
}

async function searchOpenFoodFacts(term: string): Promise<FoodCandidate[] | null> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}` +
    `&search_simple=1&action=process&json=1&page_size=${MAX_RESULTS}` +
    `&fields=code,product_name,brands,serving_quantity,serving_size,nutriments`;

  const raw = await getJson(url, { "user-agent": OFF_USER_AGENT });
  if (!raw) return null;
  const parsed = offBusquedaSchema.safeParse(raw);
  if (!parsed.success) return null;
  return normalizeOpenFoodFacts(parsed.data.products);
}

async function getOffProduct(barcode: string): Promise<FoodCandidate[] | null> {
  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=code,product_name,brands,serving_quantity,serving_size,nutriments`;

  const raw = await getJson(url, { "user-agent": OFF_USER_AGENT });
  if (!raw) return null;
  const parsed = offUnoSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.product) return [];
  return normalizeOpenFoodFacts([parsed.data.product]);
}

/**
 * Busca un alimento. Por código de barras va solo a OFF; por texto, a los dos
 * en paralelo.
 *
 * Todo lo que sale de aquí ha pasado por `plausibleMacros`: es el guardián de
 * la tabla global `foods`, y filtrar aquí —y no al guardar— evita además
 * enseñarle al usuario una ficha rota que no se va a poder registrar.
 */
export async function lookupFoods(rawQuery: string): Promise<FoodLookupResult> {
  const query = rawQuery.trim();
  if (!query) return { ok: false, candidates: [], reason: "Escribe qué buscas." };

  const barcode = isBarcode(query);
  const respuestas = barcode
    ? [await getOffProduct(barcode)]
    : await Promise.all([searchUsda(query), searchOpenFoodFacts(query)]);

  // `null` es «no contestó»; `[]` es «contestó y no hay nada». La diferencia
  // decide si se dice «no se pudo consultar» o «no se encontró».
  if (respuestas.every((r) => r === null)) {
    return {
      ok: false,
      candidates: [],
      reason: barcode
        ? "No se pudo consultar Open Food Facts. Captura el alimento a mano; el buscador es opcional."
        : "No se pudo consultar FoodData Central ni Open Food Facts. Captura el alimento a mano; el buscador es opcional."
    };
  }

  const todos = respuestas.flatMap((r) => r ?? []).filter((c) => plausibleMacros(c.per100g));
  return { ok: true, candidates: rankFoods(dedupeFoods(todos), query).slice(0, MAX_RESULTS) };
}
