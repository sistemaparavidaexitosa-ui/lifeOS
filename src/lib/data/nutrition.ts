import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupFoods } from "@/lib/integrations/nutrition";
import {
  dedupeFoods,
  isBarcode,
  plausibleMacros,
  rankFoods,
  type FoodCandidate
} from "@/lib/domain/development/nutrition-lookup.ts";

/**
 * LA CACHÉ DE ALIMENTOS SE CONSULTA ANTES QUE LA RED.
 *
 * No es una optimización: es lo que hace viable la feature. Open Food Facts
 * permite 15 peticiones por minuto **por IP**, y todos los usuarios del
 * despliegue comparten la de Vercel. Sin caché, dos personas buscando a la vez
 * se estorban.
 *
 * Por eso `foods` no es un memo de resultados: es el ÍNDICE DE BÚSQUEDA
 * PRIMARIO. Un código de barras que ya se buscó una vez no vuelve a salir a
 * internet nunca.
 *
 * POR QUÉ ESTO NO VIVE EN `lib/integrations/nutrition.ts`: aquella capa no
 * toca Supabase, igual que `books.ts`, y no debe empezar. La red no sabe nada
 * de nuestra base y la base no sabe nada de la red; el pegamento es este
 * archivo.
 */

export interface CachedFood extends FoodCandidate {
  /** El id de `foods`. `null` si viene de la red y no se pudo guardar. */
  id: string | null;
}

export interface FoodSearchResult {
  ok: boolean;
  foods: CachedFood[];
  reason?: string;
}

/**
 * Cuántas filas en caché bastan para no salir a la red.
 *
 * Cinco y no una: con una sola coincidencia la caché contestaría «avena» con
 * lo primero que alguien buscó una vez, y el usuario no vería el resto del
 * catálogo nunca.
 */
const CACHE_SUFICIENTE = 5;
const MAX_RESULTS = 8;

type FilaFood = {
  id: string;
  source: string;
  source_ref: string;
  name: string;
  brand: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  serving_g: number | null;
  serving_label: string;
};

const COLUMNAS = "id, source, source_ref, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g, serving_label";

function desdeFila(f: FilaFood): CachedFood {
  return {
    id: f.id,
    source: f.source === "usda" ? "usda" : "off",
    sourceRef: f.source_ref,
    name: f.name,
    brand: f.brand,
    per100g: { kcal: f.kcal_100g, proteinG: f.protein_100g, carbsG: f.carbs_100g, fatG: f.fat_100g },
    servingG: f.serving_g,
    servingLabel: f.serving_label
  };
}

/**
 * Guarda en la caché lo que vino de la red.
 *
 * Escribe el cliente ADMIN porque `foods` no concede `insert` a
 * `authenticated`: vía PostgREST cualquiera podría envenenar la caché que ven
 * todos. El `upsert` por `(source, source_ref)` hace que dos usuarios buscando
 * lo mismo a la vez no dupliquen la fila.
 *
 * **Un fallo aquí no es un error del usuario.** Si falta la llave de servicio
 * o la escritura no pasa, se devuelven los candidatos igual: una caché que no
 * se puede escribir es una caché lenta, no una búsqueda rota.
 */
async function guardarEnCache(candidatos: readonly FoodCandidate[]): Promise<Map<string, string>> {
  const porClave = new Map<string, string>();
  if (!candidatos.length) return porClave;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("foods")
      .upsert(
        candidatos.map((c) => ({
          source: c.source,
          source_ref: c.sourceRef,
          name: c.name,
          brand: c.brand,
          kcal_100g: c.per100g.kcal,
          protein_100g: c.per100g.proteinG,
          carbs_100g: c.per100g.carbsG,
          fat_100g: c.per100g.fatG,
          serving_g: c.servingG,
          serving_label: c.servingLabel,
          fetched_at: new Date().toISOString()
        })),
        { onConflict: "source,source_ref" }
      )
      .select("id, source, source_ref");

    for (const fila of data ?? []) porClave.set(`${fila.source}:${fila.source_ref}`, fila.id);
  } catch {
    // Deliberadamente mudo: ver la cabecera de esta función.
  }
  return porClave;
}

/**
 * Busca un alimento: primero en la caché, después en la red.
 *
 * Se llama desde el Route Handler, que es donde el cliente admin está
 * permitido (ver la cabecera de `lib/supabase/admin.ts`).
 */
export async function searchFoods(rawQuery: string): Promise<FoodSearchResult> {
  const query = rawQuery.trim();
  if (!query) return { ok: false, foods: [], reason: "Escribe qué buscas." };

  const supabase = await createClient();
  const barcode = isBarcode(query);

  const { data: enCache } = barcode
    ? await supabase.from("foods").select(COLUMNAS).eq("source", "off").eq("source_ref", barcode).limit(1)
    : await supabase
        .from("foods")
        .select(COLUMNAS)
        .textSearch("search", query, { type: "websearch" })
        .limit(MAX_RESULTS);

  const cacheadas = (enCache ?? []).map((f) => desdeFila(f as FilaFood));

  // Un acierto por código de barras son CERO peticiones, que es el caso que
  // más se repite: la misma barrita de siempre.
  if (barcode ? cacheadas.length > 0 : cacheadas.length >= CACHE_SUFICIENTE) {
    return { ok: true, foods: rankFoods(cacheadas, query) as CachedFood[] };
  }

  const red = await lookupFoods(query);
  if (!red.ok && !cacheadas.length) return { ok: false, foods: [], reason: red.reason };

  // Los proveedores cayeron pero la caché tenía algo: se dice y se entrega.
  // `books.ts` no puede hacer esto porque no tiene tabla; aquí sale gratis.
  if (!red.ok) {
    return {
      ok: true,
      foods: rankFoods(cacheadas, query) as CachedFood[],
      reason: "Los proveedores no respondieron; esto es lo que ya teníamos guardado."
    };
  }

  const frescos = red.candidates.filter((c) => plausibleMacros(c.per100g));
  const ids = await guardarEnCache(frescos);

  const mezcla = dedupeFoods([...cacheadas, ...frescos]).map((c) => ({
    ...c,
    id: (c as CachedFood).id ?? ids.get(`${c.source}:${c.sourceRef}`) ?? null
  }));

  return { ok: true, foods: rankFoods(mezcla, query).slice(0, MAX_RESULTS) as CachedFood[] };
}
