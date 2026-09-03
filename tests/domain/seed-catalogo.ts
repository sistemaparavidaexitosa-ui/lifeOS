// El catálogo que la migración 0044 siembra, leído del propio SQL.
//
// POR QUÉ ASÍ. Hasta la 0044 el catálogo era un array en un `.ts` y estas
// pruebas lo importaban. Ahora vive en `template_catalog`, y una prueba unitaria
// no levanta Postgres — pero el contenido que se despliega sigue estando en un
// archivo: el `insert` de la migración. Ése es el catálogo con el que arranca
// cualquier entorno nuevo, así que es el que hay que seguir vigilando.
//
// Lo que NO cubre, y conviene decirlo: una plantilla que un administrador
// escriba después desde el panel no pasa por aquí. A ésa la protege el zod de
// `src/lib/domain/templates/schema.ts`, que corre al guardarla y al leerla.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseTemplate } from "../../src/lib/domain/templates/schema.ts";
import type { ProjectTemplate } from "../../src/lib/domain/execution/project-templates.ts";
import type { HabitTemplate, RoutineTemplate } from "../../src/lib/domain/development/templates.ts";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sql = readFileSync(join(raiz, "supabase", "migrations", "0044_admin_catalogo_plantillas.sql"), "utf8");

export interface FilaSembrada {
  kind: "project" | "routine" | "habit";
  slug: string;
  status: string;
  position: number;
  payload: unknown;
}

const FILA = /\('(project|routine|habit)', '([a-z0-9-]+)', '(draft|published)', (\d+), \$json\$([\s\S]*?)\$json\$::jsonb\)/g;

export const FILAS_SEMBRADAS: FilaSembrada[] = [...sql.matchAll(FILA)].map((m) => ({
  kind: m[1] as FilaSembrada["kind"],
  slug: m[2],
  status: m[3],
  position: Number(m[4]),
  payload: JSON.parse(m[5])
}));

function deTipo<T>(kind: FilaSembrada["kind"]): T[] {
  return FILAS_SEMBRADAS.filter((f) => f.kind === kind).map((f) => {
    const t = parseTemplate(kind, f.payload);
    if (!t) throw new Error(`La plantilla sembrada ${kind}/${f.slug} no pasa el esquema.`);
    return t as T;
  });
}

export const PROYECTOS_SEMBRADOS: ProjectTemplate[] = deTipo("project");
export const RUTINAS_SEMBRADAS: RoutineTemplate[] = deTipo("routine");
export const HABITOS_SEMBRADOS: HabitTemplate[] = deTipo("habit");

/** El equivalente al `getProjectTemplate` de cuando el catálogo era un array. */
export function buscar<T extends { id: string }>(lista: T[], id: string): T | undefined {
  return lista.find((t) => t.id === id);
}
