import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { openai, PLAN_MODEL, PLAN_MAX_OUTPUT_TOKENS } from "./openai-provider";
import { PLAN_LIMITS, sanitizePlan, type AiPlanDraft } from "@/lib/domain/execution/ai-plan.ts";

/**
 * Genera la ESTRUCTURA de un proyecto a partir de un objetivo y un plazo.
 *
 * Esta capa no ve Supabase ni sabe qué es un `project_id`: recibe texto y
 * devuelve un borrador. Quien la llama decide si eso se escribe. Mismo reparto
 * que `recommend.ts`.
 *
 * `zod` CLÁSICA A PROPÓSITO, y es justo lo contrario de lo que hace
 * `recommend.ts` (ver D-027 y D-075). El helper de Anthropic convierte el
 * esquema con el núcleo v4 y revienta con uno v3; el `zodTextFormat` de OpenAI
 * va por `zod-to-json-schema`, que revienta con uno v4
 * (openai/openai-node#1602). Cada archivo importa el que su SDK admite. NO se
 * unifican: unificar rompe uno de los dos.
 */

// Todos los campos son OBLIGATORIOS. Structured Outputs corre en modo estricto
// (`additionalProperties: false` y `required` completo), y un `.optional()`
// aquí hace que la petición se rechace con un 400 antes de llegar al modelo.
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
 * D-030): que OpenAI esté caído, sin saldo o lento no puede tumbar el tablero
 * de proyectos, que es una pantalla que se usa sin IA todos los días.
 */
export async function planProject(input: PlanInput): Promise<PlanResult> {
  if (!input.objective.trim()) return { ok: false, reason: "Hace falta un objetivo para poder planear." };

  try {
    const response = await openai().responses.parse({
      model: PLAN_MODEL,
      max_output_tokens: PLAN_MAX_OUTPUT_TOKENS,
      // Estructurar un proyecto es criterio, no redacción; pero tampoco es un
      // problema abierto. `medium` es el punto donde deja de mejorar y empieza
      // solo a costar tokens de razonamiento contra `max_output_tokens`.
      reasoning: { effort: "medium" },
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildPrompt(input) }
      ],
      text: { format: zodTextFormat(PlanSchema, "plan") }
    });

    // Las dos formas de fallar SIN error HTTP, y por eso se comprueban a mano:
    // la respuesta se cortó por el tope de tokens, o el modelo se negó. En
    // ambas `output_parsed` viene vacío y sin esto el usuario vería un
    // "no se pudo" genérico que no dice qué hacer.
    if (response.status === "incomplete") {
      const motivo = response.incomplete_details?.reason;
      return {
        ok: false,
        reason:
          motivo === "max_output_tokens"
            ? "El plan salió demasiado largo y se cortó. Prueba con un objetivo más acotado."
            : "El modelo no pudo terminar la respuesta. Inténtalo otra vez."
      };
    }

    const refusal = response.output
      .flatMap((item) => (item.type === "message" ? item.content : []))
      .find((content) => content.type === "refusal");
    if (refusal && refusal.type === "refusal") {
      return { ok: false, reason: `El modelo no quiso planear esto: ${refusal.refusal}` };
    }

    if (!response.output_parsed) {
      return { ok: false, reason: "El modelo no devolvió una respuesta con la forma esperada." };
    }

    // El esquema garantiza la FORMA; `sanitizePlan` garantiza las REGLAS
    // —topes, colores, cero fechas—, que ningún esquema puede garantizar.
    const plan = sanitizePlan(response.output_parsed);
    if (!plan.groups.length) {
      return { ok: false, reason: "El plan que devolvió el modelo llegó vacío. Inténtalo otra vez." };
    }

    return { ok: true, plan };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Error al consultar el modelo" };
  }
}
