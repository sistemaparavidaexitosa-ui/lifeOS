import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { parseTemplate, type TemplateKind, type TemplateStatus } from "@/lib/domain/templates/schema.ts";
import type { ProjectTemplate } from "@/lib/domain/execution/project-templates.ts";
import type { HabitTemplate, RoutineTemplate } from "@/lib/domain/development/templates.ts";

// El catálogo de plantillas, leído de `template_catalog` (0044).
//
// Sustituye a los arrays que vivían en `project-templates.ts` y en
// `development/templates.ts`. Lo que NO sustituye es el resto de esos archivos:
// `plannedRows`, `templateSummary`, `routineTemplateDuration`,
// `matchHabitForStep` y `habitTemplatesByCategory` reciben el OBJETO de
// plantilla, no el array, así que siguen siendo dominio puro y sus pruebas
// siguen corriendo sin levantar Postgres. Aquí solo cambia de dónde sale el
// objeto.
//
// `cache()` por el mismo motivo que en workspaces.ts: en un solo render la
// lista se la piden la página y el selector, y no tiene sentido consultar dos
// veces una tabla que no cambia dentro del request.
//
// LA RLS ES QUIEN FILTRA LOS BORRADORES, no un `.eq("status", ...)` de aquí:
// la política de 0044 dice `status = 'published' or is_admin()`. Por eso
// `listTemplates` no pide nada y `listAdminTemplates` tampoco: los dos reciben
// lo que a esa sesión le corresponde ver. Lo único que hace la diferencia es
// que uno recorta a publicadas y el otro no.

export interface CatalogRow<T> {
  slug: string;
  status: TemplateStatus;
  position: number;
  updatedAt: string;
  template: T;
}

type TemplateOf<K extends TemplateKind> = K extends "project"
  ? ProjectTemplate
  : K extends "routine"
    ? RoutineTemplate
    : HabitTemplate;

async function fetchRows<K extends TemplateKind>(kind: K, soloPublicadas: boolean): Promise<CatalogRow<TemplateOf<K>>[]> {
  const supabase = await createClient();
  let query = supabase
    .from("template_catalog")
    .select("slug, status, position, updated_at, payload")
    .eq("kind", kind)
    .order("position", { ascending: true });
  if (soloPublicadas) query = query.eq("status", "published");

  const { data, error } = await query;
  if (error || !data) return [];

  const filas: CatalogRow<TemplateOf<K>>[] = [];
  for (const fila of data) {
    // Una fila que no valida se DESCARTA, no tumba la lista. Once plantillas
    // buenas valen más que una excepción por una mala, y quien la escribió es
    // un administrador que puede corregirla desde el panel.
    const template = parseTemplate(kind, fila.payload);
    if (!template) {
      console.error(`template_catalog: la plantilla ${kind}/${fila.slug} no pasa el esquema y se omite.`);
      continue;
    }
    filas.push({
      slug: fila.slug,
      status: fila.status as TemplateStatus,
      position: fila.position,
      updatedAt: fila.updated_at,
      template: template as TemplateOf<K>
    });
  }
  return filas;
}

/** Las plantillas que ve un usuario cualquiera: solo las publicadas. */
export const listTemplates = cache(async <K extends TemplateKind>(kind: K): Promise<TemplateOf<K>[]> => {
  const filas = await fetchRows(kind, true);
  return filas.map((f) => f.template);
});

/** Una plantilla publicada por su slug, o `null` si no existe o no está publicada. */
export async function getTemplate<K extends TemplateKind>(kind: K, slug: string): Promise<TemplateOf<K> | null> {
  const todas = await listTemplates(kind);
  return todas.find((t) => t.id === slug) ?? null;
}

/**
 * Lo que ve el panel: publicadas Y borradores, con el estado a la vista.
 *
 * Sin `cache()` a propósito. Las demás lecturas se deduplican porque varias
 * partes de una pantalla piden lo mismo; ésta se usa justo después de guardar,
 * y una caché de request devolvería lo de antes del `revalidatePath`.
 */
export async function listAdminTemplates<K extends TemplateKind>(kind: K): Promise<CatalogRow<TemplateOf<K>>[]> {
  return fetchRows(kind, false);
}

/** Una fila del catálogo para el editor, borrador incluido. */
export async function getAdminTemplate<K extends TemplateKind>(kind: K, slug: string): Promise<CatalogRow<TemplateOf<K>> | null> {
  const filas = await fetchRows(kind, false);
  return filas.find((f) => f.slug === slug) ?? null;
}

/**
 * Si el usuario de la sesión administra el catálogo.
 *
 * Es la MISMA función que usan las políticas de 0044 (`public.is_admin()`), no
 * una segunda lectura de `profiles` que pudiera decir otra cosa: una sola
 * definición de quién es admin, en la base, consultada desde los dos lados.
 */
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
});
