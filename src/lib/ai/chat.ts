import "server-only";
import { z } from "zod";
import { generateJson, CHAT_BUDGET, type GeminiSchema } from "./gemini-provider";
import { sanitizeProposedMemory, sanitizeProposedTask, type ChatMessageLike } from "@/lib/domain/ai/chat.ts";
import { MEMORY_SCOPES, type MemoryScope } from "@/lib/domain/insights/memory.ts";
import type { InsightContext } from "@/lib/insights/context";
import type { CajaDeHerramientas } from "./tools";

/**
 * Un turno del chat de IA transversal.
 *
 * Esta capa no ve Supabase ni sabe qué es un `user_id`: recibe hechos ya
 * calculados y seudonimizados más la conversación previa, y devuelve texto.
 * Mismo reparto que `recommend.ts` y `plan-project.ts` — y por el mismo
 * motivo: quien la llama decide si algo de esto se escribe.
 *
 * POR QUÉ EL MISMO CONTEXTO QUE EL MOTOR, Y NO UNO PROPIO
 * `src/lib/insights/context.ts` es el ÚNICO punto donde se aplica el filtro de
 * privacidad (§3.2, D-027): un archivo que auditar. Un chat con su propia
 * forma de reunir datos sería un segundo camino por el que salen cifras del
 * servidor, con sus propias reglas y su propia manera de quedarse atrás.
 */

const ReplySchema = z.object({
  text: z.string().describe("La respuesta al usuario, en español. Directa y en la longitud que pida la pregunta."),
  factIds: z
    .array(z.string())
    .describe("Los id EXACTOS de los hechos en los que te apoyaste. Vacío si la respuesta no usó ninguno."),
  proposedTaskTitle: z
    .string()
    .describe(
      "El título de UNA tarea que el usuario pidió registrar, en imperativo y sin fecha. Cadena VACÍA en la mayoría de los turnos: solo se rellena cuando pide claramente apuntar algo."
    ),
  proposedMemoryText: z
    .string()
    .describe(
      "UN hecho duradero sobre el usuario que convenga recordar siempre. Cadena VACÍA en casi todos los turnos."
    ),
  proposedMemoryScope: z
    .string()
    .describe(`El ámbito del hecho anterior. Uno de: ${MEMORY_SCOPES.join(", ")}. Cadena vacía si no propones nada.`)
});

/** El mismo contrato, en el dialecto que entiende `responseSchema`. */
const REPLY_RESPONSE_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    text: { type: "STRING", description: "La respuesta al usuario, en español. Directa y en la longitud que pida la pregunta." },
    factIds: {
      type: "ARRAY",
      description: "Los id EXACTOS de los hechos en los que te apoyaste. Vacío si la respuesta no usó ninguno.",
      items: { type: "STRING" }
    },
    proposedTaskTitle: {
      type: "STRING",
      description:
        "El título de UNA tarea que el usuario pidió registrar, en imperativo y sin fecha. Cadena VACÍA en la mayoría de los turnos: solo se rellena cuando pide claramente apuntar algo."
    },
    proposedMemoryText: {
      type: "STRING",
      description:
        "UN hecho duradero sobre el usuario que convenga recordar siempre. Cadena VACÍA en casi todos los turnos."
    },
    proposedMemoryScope: {
      type: "STRING",
      description: `El ámbito del hecho anterior. Cadena vacía si no propones nada.`,
      enum: [...MEMORY_SCOPES, ""],
      format: "enum"
    }
  },
  required: ["text", "factIds", "proposedTaskTitle", "proposedMemoryText", "proposedMemoryScope"],
  propertyOrdering: ["text", "factIds", "proposedTaskTitle", "proposedMemoryText", "proposedMemoryScope"]
};

const SYSTEM = `Eres el asistente de Life OS, un sistema personal de gestión de vida. Trabajas en español y hablas de tú.

Recibes HECHOS ya calculados por el sistema a partir de los datos reales del usuario, la conversación previa y su pregunta. Contestas la pregunta.

Tienes dos herramientas y conviene que las uses antes de decir que no sabes algo:
- 'leer_hechos' te trae hechos ya calculados de los dominios que pidas. Úsala cuando la pregunta toque algo que no está entre los hechos que ya tienes delante.
- 'consultar' te trae filas concretas de una tabla en una ventana de fechas. Úsala solo para el detalle: qué día pasó algo, qué entradas hubo. Pide ventanas cortas.
- Lo que devuelven trae 'id'. Cítalos en 'factIds' igual que los hechos del prompt.
- Si una herramienta contesta con 'error', no insistas con la misma llamada: dilo en una frase y sigue con lo que tengas.
- Como mucho dos rondas de herramientas. Después hay que contestar.

Reglas que no puedes romper:
- NO calcules nada. Los números ya vienen en los hechos; úsalos tal cual. Si una cifra no está en un hecho, no existe y no la mencionas.
- Cita en 'factIds' los id exactos de los hechos en los que te apoyaste. Si contestaste sin apoyarte en ninguno, déjalo vacío: es una respuesta válida.
- Si no tienes hechos para contestar, dilo en una frase y ofrece lo que sí puedes hacer. No rellenes con generalidades ni finjas que sabes.
- No inventes contexto sobre la vida del usuario que no esté en los hechos.
- Los nombres de personas y cuentas vienen seudonimizados ('Dependiente #1', 'Cuenta #2'). Úsalos tal cual; no intentes adivinar quiénes son.
- Contesta en la longitud que pida la pregunta. Un «¿cuánto llevo gastado?» se responde en una frase, no en un informe.
- No uses encabezados ni tablas: esto se lee en una columna estrecha. Listas cortas sí, cuando de verdad son una lista.

Sobre 'proposedTaskTitle':
- Rellénalo SOLO cuando el usuario pida claramente registrar, apuntar o recordar algo que hacer. Una pregunta no es un encargo.
- Como máximo UNA tarea, en imperativo, en una línea y SIN FECHA de ningún tipo.
- En cualquier otro caso, cadena vacía. Es lo normal.
- Tú no creas nada: propones. El usuario confirma con un botón.

Sobre 'proposedMemoryText' y 'proposedMemoryScope':
- Rellénalos SOLO cuando el usuario revele algo sobre sí mismo que seguirá siendo verdad dentro de seis meses: una restricción («soy celíaco»), una preferencia estable («entreno por la mañana»), un objetivo de fondo, una decisión tomada.
- NO es memoria lo que pasó hoy o ayer, ni una cifra, ni un plan para esta semana. Eso ya está en los datos del sistema y ahí se consulta.
- Como máximo UNO por turno, en una frase, en tercera persona y sin fechas.
- En cualquier otro caso, cadena vacía en los dos. Es lo normal.
- Tú no guardas nada: propones. El usuario confirma con un botón.`;

export interface ChatInput {
  context: InsightContext;
  /** La ventana de conversación previa, ya recortada por `recortarHistorial`. */
  history: readonly ChatMessageLike[];
  message: string;
  /**
   * Lo que el modelo puede consultar si los hechos del contexto no bastan.
   * Opcional: sin ella el chat funciona como siempre, con lo que le quepa en
   * el prompt. Es lo que se pierde —y solo eso— cuando las herramientas fallan.
   */
  tools?: CajaDeHerramientas;
}

export interface ChatResult {
  ok: boolean;
  text: string;
  factIds: string[];
  /** Ya saneado: sin fechas, con tope, o `null` si no hay propuesta. */
  proposedTask: string | null;
  /** Ya saneada: hecho duradero con ámbito válido, o `null`. */
  proposedMemory: { text: string; scope: MemoryScope } | null;
  reason?: string;
}

function buildPrompt(input: ChatInput): string {
  const partes: string[] = [];

  if (input.context.facts.length) {
    partes.push(`HECHOS:\n${input.context.facts.map((f) => `- id: ${f.id} | ${f.label}`).join("\n")}`);
  } else {
    // Decirlo explícitamente y no callarlo: sin esto el modelo redacta como si
    // tuviera la foto completa y se inventa el resto (§4.2).
    partes.push("HECHOS: ninguno. No tienes datos del usuario en este turno.");
  }

  if (input.context.memory.length) {
    partes.push(`Lo que el usuario te ha dicho y debes respetar:\n${input.context.memory.map((m) => `- ${m}`).join("\n")}`);
  }

  if (input.context.skippedDomains.length) {
    partes.push(
      `(El usuario no autorizó estos dominios, así que no tienes sus datos: ${input.context.skippedDomains.join(", ")}. No especules sobre ellos.)`
    );
  }

  if (input.history.length) {
    partes.push(
      `CONVERSACIÓN PREVIA:\n${input.history
        .map((m) => `${m.role === "user" ? "Usuario" : "Tú"}: ${m.content}`)
        .join("\n")}`
    );
  }

  // La pregunta va AL FINAL: es lo último que lee el modelo antes de responder.
  partes.push(`PREGUNTA DEL USUARIO:\n${input.message.trim()}`);

  return partes.join("\n\n");
}

/**
 * NUNCA LANZA. Mismo contrato que `recommend()` y `planProject()` (D-021,
 * D-030). Aquí importa el doble: el rail del chat está montado en TODAS las
 * pantallas, así que una excepción suya no tumbaría una página sino la app.
 */
export async function chatReply(input: ChatInput): Promise<ChatResult> {
  const message = input.message.trim();
  if (!message) return { ok: false, text: "", factIds: [], proposedTask: null, proposedMemory: null, reason: "Escribe algo primero." };

  const result = await generateJson({
    system: SYSTEM,
    prompt: buildPrompt(input),
    schema: REPLY_RESPONSE_SCHEMA,
    budget: CHAT_BUDGET,
    tools: input.tools?.declaraciones,
    executeTool: input.tools?.ejecutar,
    validate: (raw) => {
      const parsed = ReplySchema.safeParse(raw);
      return parsed.success
        ? ({ ok: true, value: parsed.data } as const)
        : ({ ok: false, reason: "El modelo no devolvió una respuesta con la forma esperada." } as const);
    }
  });

  if (!result.ok || !result.data) {
    return { ok: false, text: "", factIds: [], proposedTask: null, proposedMemory: null, reason: result.reason };
  }

  const text = result.data.text.trim();
  if (!text) {
    return { ok: false, text: "", factIds: [], proposedTask: null, proposedMemory: null, reason: "El modelo devolvió una respuesta vacía." };
  }

  // Solo los id que de verdad existen. El modelo puede citar de memoria uno que
  // no le dimos, y una cita que no se puede seguir no es una cita. Es la misma
  // idea que `validateAnchoring`, pero aquí NO se descarta la respuesta: en un
  // chat, una frase útil sin respaldo sigue siendo una respuesta a la pregunta.
  // Los del contexto MÁS los que entregaron las herramientas. Sin esta unión,
  // todo lo que el modelo se molestó en consultar se le descartaría por
  // «inventado» — y la cita desaparecería justo de las respuestas mejor
  // fundamentadas.
  const conocidos = new Set([...input.context.facts.map((f) => f.id), ...(input.tools?.entregados() ?? [])]);
  const factIds = [...new Set(result.data.factIds.filter((id) => conocidos.has(id)))];

  return {
    ok: true,
    text,
    factIds,
    proposedTask: sanitizeProposedTask(result.data.proposedTaskTitle),
    proposedMemory: sanitizeProposedMemory({
      text: result.data.proposedMemoryText,
      scope: result.data.proposedMemoryScope
    })
  };
}
