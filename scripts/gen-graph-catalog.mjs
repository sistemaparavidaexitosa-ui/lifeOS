#!/usr/bin/env node
// Genera `src/lib/domain/graph/catalog.generated.ts` desde los catálogos de la
// base: `graph_node_types`, `graph_rel_types` y las rutas de `graph_sources`.
//
// POR QUÉ EXISTE
// Los dieciocho tipos de nodo llegaron a estar escritos cuatro veces y las
// catorce relaciones tres, y dos columnas del catálogo —`is_dependency` y
// `is_projected`— estaban además reimplementadas a mano en TypeScript. Hoy
// coincidían por suerte. Esto las reduce a una.
//
// LA FRONTERA (0060): la base es dueña de las PALABRAS y de la SEMÁNTICA;
// TypeScript es dueño de la GEOMETRÍA. Aquí solo baja lo primero. El radio de
// un círculo y el grosor de un trazo se quedan en `theme.ts`, indexados por la
// unión que este archivo genera — así que añadir un tipo con un INSERT ROMPE la
// compilación hasta que alguien diga de qué tamaño se dibuja.
//
// CERO DEPENDENCIAS NUEVAS (D-008). No hay cliente de Postgres en el
// repositorio, así que se habla con la base por `psql` si está en el PATH y por
// `docker exec` si no — que es el caso de una máquina con la pila de Supabase
// en Docker y sin postgresql-client instalado.
//
// Uso:  pnpm gen:graph-catalog        (o `--check` para no escribir y avisar
//                                      si el archivo del repo está desfasado)

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = resolve(RAIZ, "src/lib/domain/graph/catalog.generated.ts");
const SOLO_COMPROBAR = process.argv.includes("--check");

const CONSULTA = `
select json_build_object(
  'nodos', (
    select json_agg(json_build_object(
      'tipo', node_type, 'label', label, 'plural', label_plural,
      'color', color, 'proyectado', is_projected) order by position, node_type)
    from public.graph_node_types),
  'relaciones', (
    select json_agg(json_build_object(
      'tipo', rel_type, 'label', label, 'dependencia', is_dependency,
      'invertida', reversed, 'simetrica', is_symmetric) order by position, rel_type)
    from public.graph_rel_types),
  'rutas', (
    select json_agg(json_build_object(
      'tabla', entity_table, 'ruta', route_template) order by entity_table)
    from public.graph_sources where enabled)
)`.trim();

function projectId() {
  const toml = readFileSync(resolve(RAIZ, "supabase/config.toml"), "utf8");
  const m = toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error("No encuentro project_id en supabase/config.toml");
  return m[1];
}

/** Devuelve la fila única de la consulta, o lanza con un mensaje que se entienda. */
function consultar() {
  const url = process.env.SUPABASE_DB_URL
    ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const intentos = [
    { cmd: "psql", args: [url, "-At", "-c", CONSULTA] },
    { cmd: "docker", args: ["exec", "-i", `supabase_db_${projectId()}`,
                            "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", CONSULTA] }
  ];

  const fallos = [];
  for (const { cmd, args } of intentos) {
    try {
      return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch (e) {
      fallos.push(`${cmd}: ${(e.stderr || e.message || "").toString().trim().split("\n")[0]}`);
    }
  }
  throw new Error(
    "No pude leer el catálogo de la base. Necesito `psql` en el PATH o la pila local en Docker.\n" +
    "Arranca la base con `npx supabase start` y vuelve a intentarlo.\n  " + fallos.join("\n  ")
  );
}

/** `var(--c-purple)` -> `--c-purple`. El lienzo resuelve la variable él mismo. */
function nombreDeVariable(color) {
  const m = color.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return m ? m[1] : color;
}

const cita = (s) => JSON.stringify(s);

function generar(datos) {
  const nodos = datos.nodos.map((n) =>
    `  ${n.tipo}: { label: ${cita(n.label)}, plural: ${cita(n.plural)}, ` +
    `colorVar: ${cita(nombreDeVariable(n.color))}, proyectado: ${n.proyectado} },`
  ).join("\n");

  const relaciones = datos.relaciones.map((r) =>
    `  ${r.tipo}: { label: ${cita(r.label)}, dependencia: ${r.dependencia}, ` +
    `invertida: ${r.invertida}, simetrica: ${r.simetrica} },`
  ).join("\n");

  const rutas = datos.rutas.map((r) => `  ${r.tabla}: ${cita(r.ruta)},`).join("\n");

  return `// GENERADO por scripts/gen-graph-catalog.mjs — NO EDITAR A MANO.
//
// Fuente: \`graph_node_types\`, \`graph_rel_types\` y \`graph_sources\` de la base.
// Regenerar con \`pnpm gen:graph-catalog\` después de tocar el catálogo.
//
// Aquí solo baja lo que la base posee: las palabras y la semántica. La
// geometría —radios, grosores, líneas discontinuas— vive en \`theme.ts\`, y va
// indexada por los tipos de este archivo, así que un tipo nuevo en la base
// rompe la compilación hasta que alguien decida cómo se dibuja.

/** Los tipos de nodo del catálogo, en el orden en que los enseña la interfaz. */
export const NODE_CATALOG = {
${nodos}
} as const;

/** Las relaciones del catálogo. \`invertida\` es lo que hace funcionar el Mapa de impacto. */
export const REL_CATALOG = {
${relaciones}
} as const;

/** De la tabla del dominio a la pantalla donde vive. \`{id}\` es el único marcador. */
export const ROUTE_TEMPLATES = {
${rutas}
} as const;
`;
}

const crudo = consultar();
if (!crudo) throw new Error("La base devolvió una respuesta vacía; ¿están aplicadas las migraciones?");
const generado = generar(JSON.parse(crudo));

if (SOLO_COMPROBAR) {
  let actual = "";
  try { actual = readFileSync(DESTINO, "utf8"); } catch { /* no existe todavía */ }
  if (actual !== generado) {
    console.error(
      "catalog.generated.ts está desfasado respecto al catálogo de la base.\n" +
      "Corre `pnpm gen:graph-catalog` y commitea el resultado."
    );
    process.exit(1);
  }
  console.log("catalog.generated.ts está al día.");
} else {
  writeFileSync(DESTINO, generado);
  console.log(`Escrito ${DESTINO}`);
}
