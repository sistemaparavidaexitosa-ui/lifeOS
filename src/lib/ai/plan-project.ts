import "server-only";
import { z } from "zod";
import { generateJson, PLAN_BUDGET, type GeminiSchema } from "./gemini-provider";
import { PLAN_LIMITS, sanitizePlan, type AiPlanDraft } from "@/lib/domain/execution/ai-plan.ts";

/**
 * Genera la ESTRUCTURA de un proyecto a partir de un objetivo y un plazo.
 *
 * Esta capa no ve Supabase ni sabe qué es un `project_id`: recibe texto y
 * devuelve un borrador. Quien la llama decide si eso se escribe. Mismo reparto
 * que `recommend.ts`.
 *
 * DOS ESQUEMAS Y NO UNO, A PROPÓSITO. `PlanSchema` (zod) es el que EXIGE la
 * forma de la respuesta; `PLAN_RESPONSE_SCHEMA` es el que se la PIDE al
 * modelo. Se escriben en paralelo y a mano porque el conversor automático de
 * un SDK es justo lo que ataba este archivo a `zod` clásica y `recommend.ts` a
 * `zod/v4` (D-027, D-075): un reparto que no venía de nuestro código sino de
 * sus dependencias. Sin conversor, todo el repo usa una sola `zod`, y una
 * deriva entre los dos esquemas la caza el `safeParse` de más abajo — no la
 * pantalla del usuario.
 */

// Todos los campos son OBLIGATORIOS. El modo estructurado no admite
// `additionalProperties` y da por requerido lo que se declare, así que un
// `.optional()` aquí solo serviría para que zod aceptara lo que el modelo no
// va a mandar.
const PlanTaskSchema = z.object({
  title: z.string().describe("La tarea, en español, en imperativo y en una línea. Concreta: se debe poder saber cuándo está hecha."),
  priority: z.enum(["High", "Medium", "Low"]).describe("Alta solo para lo que bloquea al resto de la fase. La mayoría es Medium."),
  subtasks: z
    .array(z.string())
    .describe(
      "Los pasos en que se descompone la tarea, si de verdad se descompone. Array VACÍO en la mayoría: solo se usa cuando la tarea son varias cosas distintas."
    )
});

const PlanGroupSchema = z.object({
  name: z
    .string()
    .describe(
      "El nombre de la fase, con su horizonte temporal dentro. Ej: «Fase 2 · Construcción (semanas 4-9)». El horizonte va AQUÍ, nunca como fecha."
    ),
  tasks: z.array(PlanTaskSchema)
});

const PlanSchema = z.object({
  name: z.string().describe("Nombre corto del plan, en español. Ej: «Plan de lanzamiento en 12 semanas»."),
  summary: z.string().describe("Una sola frase: qué enfoque tomaste y dónde termina el plan."),
  groups: z.array(PlanGroupSchema).describe("Las fases, en el orden en que se recorren.")
});

/**
 * El mismo contrato, en el dialecto que entiende `responseSchema`.
 *
 * `propertyOrdering` no es decorativo: sin él el orden de las claves puede
 * bailar entre llamadas idénticas.
 */
const PLAN_RESPONSE_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "Nombre corto del plan, en español. Ej: «Plan de lanzamiento en 12 semanas»." },
    summary: { type: "STRING", description: "Una sola frase: qué enfoque tomaste y dónde termina el plan." },
    groups: {
      type: "ARRAY",
      description: "Las fases, en el orden en que se recorren.",
      items: {
        type: "OBJECT",
        properties: {
          name: {
            type: "STRING",
            description:
              "El nombre de la fase, con su horizonte temporal dentro. Ej: «Fase 2 · Construcción (semanas 4-9)». El horizonte va AQUÍ, nunca como fecha."
          },
          tasks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                title: {
                  type: "STRING",
                  description:
                    "La tarea, en español, en imperativo y en una línea. Concreta: se debe poder saber cuándo está hecha."
                },
                priority: {
                  type: "STRING",
                  format: "enum",
                  enum: ["High", "Medium", "Low"],
                  description: "Alta solo para lo que bloquea al resto de la fase. La mayoría es Medium."
                },
                subtasks: {
                  type: "ARRAY",
                  description:
                    "Los pasos en que se descompone la tarea, si de verdad se descompone. Array VACÍO en la mayoría: solo se usa cuando la tarea son varias cosas distintas.",
                  items: { type: "STRING" }
                }
              },
              required: ["title", "priority", "subtasks"],
              propertyOrdering: ["title", "priority", "subtasks"]
            }
          }
        },
        required: ["name", "tasks"],
        propertyOrdering: ["name", "tasks"]
      }
    }
  },
  required: ["name", "summary", "groups"],
  propertyOrdering: ["name", "summary", "groups"]
};

const SYSTEM = `Eres el planificador de proyectos de Life OS, un sistema personal de gestión de vida. Trabajas en español.

Recibes un OBJETIVO y un PLAZO TOTAL. Devuelves la ESTRUCTURA del proyecto: fases, y dentro de cada fase las tareas.

Reglas que no puedes romper:

- NO DEVUELVES FECHAS. Ninguna, en ningún campo. El plazo se refleja en el NOMBRE de la fase, entre paréntesis y en horizontes relativos: «Fase 1 · Validación (semanas 1-3)». Una fecha inventada deja el tablero del usuario lleno de tareas vencidas al mes siguiente.
- El plan da ESTRUCTURA, no una lista de recados. Como máximo ${PLAN_LIMITS.groups} fases y ${PLAN_LIMITS.tasksPerGroup} tareas por fase. Prefiere pocas tareas que signifiquen algo a muchas obvias: «Montar el esqueleto y el despliegue» vale; «Abrir el editor» no.
- Las fases cubren el plazo COMPLETO y sus horizontes suman ese plazo, ni más ni menos. Repártelas según el peso real del trabajo, no en partes iguales.
- Las subtareas son la excepción, no la regla: la mayoría de las tareas lleva el array vacío. Úsalas solo cuando una tarea son de verdad varios pasos distintos, y nunca más de ${PLAN_LIMITS.subtasksPerTask}.
- Prioridad Alta solo para lo que bloquea al resto de su fase. Si marcas casi todo como Alta, no has priorizado nada.
- Cada tarea empieza por un verbo en infinitivo y se puede dar por terminada sin discusión.
- Si te entregan la ESTRUCTURA ACTUAL del proyecto, no repitas lo que ya está cubierto ahí. Tu plan CONTINÚA desde donde el usuario se quedó: planea lo que falta para llegar al objetivo.
- No inventes contexto sobre la vida del usuario. Si el objetivo es vago, planea lo genérico bien hecho en vez de suponer un sector, un presupuesto o un equipo que nadie mencionó.
- Escribe con las palabras del usuario, no con jerga de consultoría.`;

export interface PlanInput {
  objective: string;
  /** El plazo ya en palabras: «3 meses», «6 semanas». */
  deadline: string;
  /** Lo que el usuario añadió al regenerar, si añadió algo. */
  refinement?: string;
  /** Lo que ya hay en el tablero. Solo títulos: ni ids, ni personas, ni fechas. */
  existingOutline?: { group: string; tasks: string[] }[];
}

export interface PlanResult {
  ok: boolean;
  plan?: AiPlanDraft;
  reason?: string;
}

function buildPrompt(input: PlanInput): string {
  const partes = [`OBJETIVO DEL PROYECTO:\n${input.objective}`, `PLAZO TOTAL: ${input.deadline}`];

  if (input.existingOutline?.length) {
    const actual = input.existingOutline
      .map((g) => [`- ${g.group}`, ...g.tasks.map((t) => `    · ${t}`)].join("\n"))
      .join("\n");
    partes.push(
      `ESTRUCTURA ACTUAL DEL PROYECTO (ya existe en el tablero; NO la repitas, continúa desde aquí):\n${actual}`
    );
  }

  // El matiz va AL FINAL: es la corrección más reciente del usuario y lo
  // último que lee el modelo antes de responder.
  if (input.refinement?.trim()) {
    partes.push(`AJUSTE QUE PIDE EL USUARIO:\n${input.refinement.trim()}`);
  }

  return partes.join("\n\n");
}

/**
 * NUNCA LANZA. Mismo contrato que `recommend()` y `sendEmail()` (D-021,
 * D-030): que el modelo esté caído, sin cuota o lento no puede tumbar el
 * tablero de proyectos, que es una pantalla que se usa sin IA todos los días.
 * `generateJson` ya cumple ese contrato y traduce a un motivo legible cada
 * forma de fallar —cuota agotada, respuesta cortada, negativa del modelo—;
 * aquí solo quedan las que son propias de un plan.
 */
export async function planProject(input: PlanInput): Promise<PlanResult> {
  if (!input.objective.trim()) return { ok: false, reason: "Hace falta un objetivo para poder planear." };

  const result = await generateJson({
    system: SYSTEM,
    prompt: buildPrompt(input),
    schema: PLAN_RESPONSE_SCHEMA,
    budget: PLAN_BUDGET,
    validate: (raw) => {
      const parsed = PlanSchema.safeParse(raw);
      return parsed.success
        ? ({ ok: true, value: parsed.data } as const)
        : ({ ok: false, reason: "El modelo no devolvió una respuesta con la forma esperada." } as const);
    }
  });

  if (!result.ok || !result.data) return { ok: false, reason: result.reason };

  // El esquema garantiza la FORMA; `sanitizePlan` garantiza las REGLAS
  // —topes, colores, cero fechas—, que ningún esquema puede garantizar.
  const plan = sanitizePlan(result.data);
  if (!plan.groups.length) {
    return { ok: false, reason: "El plan que devolvió el modelo llegó vacío. Inténtalo otra vez." };
  }

  return { ok: true, plan };
}
