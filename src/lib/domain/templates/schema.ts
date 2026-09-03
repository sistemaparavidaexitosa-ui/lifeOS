// La FORMA de una plantilla, validada.
//
// Desde 0044 el catálogo vive en `template_catalog.payload`, que es `jsonb`: la
// base garantiza que es JSON válido y nada más. Lo que garantiza que sea una
// plantilla es este archivo, y se usa en los DOS extremos:
//
//   - AL ESCRIBIR, en las acciones del panel: lo que no pasa por aquí no entra.
//   - AL LEER, en src/lib/data/templates.ts: una fila que no valide se DESCARTA
//     y las demás se muestran. La alternativa —confiar en que lo escrito sigue
//     siendo válido— convierte un cambio de forma futuro en un selector que
//     revienta entero por una plantilla mala.
//
// Es el reemplazo del compilador: cuando el catálogo era un array en un .ts,
// `tsc` era quien impedía una plantilla malformada. Ahora es zod.

import { z } from "zod";
import { GROUP_COLORS, type ProjectTemplate, type ProjectTemplateCategory } from "../execution/project-templates.ts";
import type { HabitCategory, HabitTemplate, RoutineTemplate } from "../development/templates.ts";

/** Los tres tipos que el panel administra. El `check` de 0044 dice lo mismo. */
export const TEMPLATE_KINDS = ["project", "routine", "habit"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABEL: Record<TemplateKind, string> = {
  project: "Plantillas de proyecto",
  routine: "Plantillas de rutina",
  habit: "Plantillas de hábito"
};

export const TEMPLATE_STATUSES = ["draft", "published"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/**
 * El identificador estable. Es el `id` que ya tenían las plantillas en código y
 * el que viaja en las acciones de aplicar, así que se restringe a lo que puede
 * ir en una URL sin escapar: minúsculas, dígitos y guiones.
 */
export const slugSchema = z
  .string()
  .min(2, "El identificador necesita al menos dos caracteres.")
  .max(64, "El identificador se pasa de largo.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones (por ejemplo, «rutina-de-manana»).");

const texto = (max: number) => z.string().trim().min(1).max(max);

const prioridad = z.enum(["High", "Medium", "Low"]);
const frecuencia = z.enum(["Diario", "Semanal", "Entre semana", "Fin de semana"]);

// Las taxonomías van escritas aquí como tuplas literales, no leídas de las
// constantes del dominio: `TEMPLATE_CATEGORIES` y `HABIT_CATEGORY_ORDER` están
// tipadas como arrays y `z.enum` necesita una tupla para inferir la unión. Que
// no se separen de la del dominio lo vigila `tsc` al final del archivo.
const categoriaProyecto = z.enum(["Trabajo y producto", "Negocio", "Marketing", "Personal"]);
const categoriaHabito = z.enum(["Salud", "Aprendizaje", "Trabajo", "Personal", "Otros"]);

// =============================================================================
// PROYECTO
// =============================================================================
// `color` se valida contra GROUP_COLORS y no contra /^#[0-9a-f]{6}$/ por lo que
// ya explica project-templates.ts: un hex inventado rompe el tema claro/oscuro,
// que se apoya en los tokens del design system.
//
// No se admiten `due`, `impact` ni `deps`, y eso es deliberado: es la misma
// lista de ausencias que documenta project-templates.ts. Una plantilla con
// fechas deja medio tablero vencido al mes siguiente, y ese atraso falso se
// cuela en Home y en el hecho `execution.overdue` del motor.
export const projectTemplateSchema = z.object({
  id: slugSchema,
  name: texto(120),
  category: categoriaProyecto,
  summary: texto(280),
  source: texto(160).optional(),
  groups: z
    .array(
      z.object({
        name: texto(80),
        color: z.enum(GROUP_COLORS),
        tasks: z
          .array(
            z.object({
              title: texto(200),
              priority: prioridad.optional(),
              subtasks: z.array(texto(200)).max(20).optional()
            })
          )
          .min(1, "Un grupo sin tareas no aporta nada al tablero.")
          .max(40)
      })
    )
    .min(1, "Una plantilla de proyecto necesita al menos un grupo.")
    .max(12)
});

// =============================================================================
// RUTINA
// =============================================================================
export const routineTemplateSchema = z.object({
  id: slugSchema,
  name: texto(120),
  source: texto(160),
  summary: texto(280),
  frequency: frecuencia,
  steps: z
    .array(
      z.object({
        title: texto(120),
        durationMin: z.number().int().min(1, "Un paso dura al menos un minuto.").max(240),
        detail: texto(280),
        // El texto con el que se intenta reconocer un hábito que el usuario YA
        // tenga, para ligar el paso a él en vez de duplicarlo (ver 0024 y
        // matchHabitForStep): la racha no se bifurca.
        habitHint: texto(80).optional()
      })
    )
    .min(1, "Una rutina necesita al menos un paso.")
    .max(20)
});

// =============================================================================
// HÁBITO
// =============================================================================
// Los tres campos además del nombre no son decoración: son las reglas de
// «Hábitos atómicos» que development/templates.ts documenta. Un hábito sin
// `cue` no se ejecuta, se recuerda con culpa; sin `twoMinVersion` se abandona
// el primer día malo. Por eso los tres son obligatorios.
export const habitTemplateSchema = z.object({
  id: slugSchema,
  name: texto(120),
  category: categoriaHabito,
  frequency: frecuencia,
  cue: texto(200),
  twoMinVersion: texto(200),
  why: texto(280)
});

export const TEMPLATE_SCHEMA_BY_KIND = {
  project: projectTemplateSchema,
  routine: routineTemplateSchema,
  habit: habitTemplateSchema
} as const;

/**
 * El `payload` de una fila, ya validado y con el tipo del dominio.
 *
 * Devuelve `null` en vez de lanzar porque quien lee un catálogo prefiere once
 * plantillas buenas a una excepción: la fila mala se descarta y se registra
 * arriba, en la capa de datos.
 */
export function parseTemplate(kind: "project", payload: unknown): ProjectTemplate | null;
export function parseTemplate(kind: "routine", payload: unknown): RoutineTemplate | null;
export function parseTemplate(kind: "habit", payload: unknown): HabitTemplate | null;
export function parseTemplate(kind: TemplateKind, payload: unknown): ProjectTemplate | RoutineTemplate | HabitTemplate | null;
export function parseTemplate(kind: TemplateKind, payload: unknown) {
  const parsed = TEMPLATE_SCHEMA_BY_KIND[kind].safeParse(payload);
  return parsed.success ? (parsed.data as ProjectTemplate | RoutineTemplate | HabitTemplate) : null;
}

// -----------------------------------------------------------------------------
// Que el esquema y los tipos no se separen.
//
// Los tipos siguen viviendo en el dominio (los usan plannedRows, templateSummary
// y compañía). Estas líneas no producen código: hacen que `tsc` falle si alguien
// añade un campo a una interfaz y se olvida del zod — que es exactamente el
// error que la base ya no puede atrapar, porque para ella `payload` es jsonb.
//
// La comprobación es DIRECCIONAL a propósito: lo que sale del esquema tiene que
// encajar en el tipo del dominio, no al revés. El esquema puede ser más
// estricto —y lo es: `color` acepta solo los seis tokens del design system,
// mientras la interfaz dice `string`— y eso es una virtud, no una divergencia.
// -----------------------------------------------------------------------------
type Cubre<Esquema, Dominio> = Esquema extends Dominio ? true : false;
const _proyecto: Cubre<z.infer<typeof projectTemplateSchema>, ProjectTemplate> = true;
const _rutina: Cubre<z.infer<typeof routineTemplateSchema>, RoutineTemplate> = true;
const _habito: Cubre<z.infer<typeof habitTemplateSchema>, HabitTemplate> = true;
// Y que las taxonomías escritas arriba sigan siendo las del dominio, completas.
const _catProyecto: Cubre<ProjectTemplateCategory, z.infer<typeof categoriaProyecto>> = true;
const _catHabito: Cubre<HabitCategory, z.infer<typeof categoriaHabito>> = true;
void _proyecto;
void _rutina;
void _habito;
void _catProyecto;
void _catHabito;
