import "server-only";
import { z } from "zod";
import { generateJson, CENTRO_BUDGET, type GeminiSchema } from "@/lib/ai/gemini-provider";
import type { CapturaCruda } from "@/lib/domain/centro/captura.ts";

/**
 * La barra del centro (D-168): una idea suelta y dónde debería vivir.
 *
 * NO ES UN CHAT. Es una captura: una pregunta, una respuesta, y se acabó. El
 * chat transversal sigue donde estaba, con su historial y sus herramientas.
 *
 * NUNCA LANZA.
 */

const SYSTEM = [
  "Recibes una idea suelta que alguien acaba de escribir en su sistema de vida.",
  "Tu único trabajo es decidir DÓNDE debería vivir. No conversas, no aconsejas, no la reescribes.",
  "",
  "Tres salidas posibles:",
  "1. `nota` — es una idea, una reflexión, algo para pensar después. Va a un cuaderno de los que te doy.",
  "   Devuelve `notebookId`, un `titulo` corto (lo que se leerá en la lista) y el `cuerpo`,",
  "   que es el texto de la persona, ordenado pero SIN inventarle nada.",
  "2. `tarea` — es algo que hay que hacer. Va a un proyecto de los que te doy. Devuelve `projectId` y `titulo`.",
  "3. `pregunta` — no está claro, o encaja en varios sitios. Devuelve `pregunta` y hasta tres `opciones`,",
  "   cada una con su `etiqueta`, su `clase` y el `id` del cuaderno o del proyecto.",
  "",
  "REGLAS:",
  "· Los `id` tienen que ser EXACTAMENTE uno de los que te doy. No inventes ninguno.",
  "· Si dudas entre nota y tarea, pregunta. Preguntar es barato; guardar en el sitio equivocado, no.",
  "· Si no hay ningún cuaderno ni proyecto que encaje, pregunta.",
  "· Español, de tú, frases cortas."
].join("\n");

const ESQUEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    clase: { type: "STRING", enum: ["nota", "tarea", "pregunta"], format: "enum", description: "Dónde va." },
    notebookId: { type: "STRING", description: "Solo para nota. Uno de los cuadernos dados." },
    projectId: { type: "STRING", description: "Solo para tarea. Uno de los proyectos dados." },
    titulo: { type: "STRING", description: "Corto. Lo que se leerá en la lista." },
    cuerpo: { type: "STRING", description: "Solo para nota: el texto de la persona, ordenado." },
    pregunta: { type: "STRING", description: "Solo si no está claro. Una línea." },
    opciones: {
      type: "ARRAY",
      description: "Solo con pregunta. Como mucho tres.",
      items: {
        type: "OBJECT",
        properties: {
          etiqueta: { type: "STRING", description: "«Nota en Ideas», «Tarea en Rediseño»." },
          clase: { type: "STRING", enum: ["nota", "tarea"], format: "enum" },
          id: { type: "STRING", description: "El id del cuaderno o del proyecto." }
        },
        required: ["etiqueta", "clase", "id"]
      }
    }
  },
  required: ["clase"]
};

const Respuesta = z.object({
  clase: z.string(),
  notebookId: z.string().optional(),
  projectId: z.string().optional(),
  titulo: z.string().optional(),
  cuerpo: z.string().optional(),
  pregunta: z.string().optional(),
  opciones: z.array(z.object({ etiqueta: z.string().optional(), clase: z.string().optional(), id: z.string().optional() })).optional()
});

export type ResultadoCaptura = { ok: true; cruda: CapturaCruda } | { ok: false; reason: string };

export async function capturarIdea(input: {
  texto: string;
  notebooks: { id: string; title: string }[];
  proyectos: { id: string; title: string }[];
}): Promise<ResultadoCaptura> {
  const cuadernos = input.notebooks.map((n) => `- ${n.title} → ${n.id}`).join("\n") || "- (ninguno)";
  const proyectos = input.proyectos.map((p) => `- ${p.title} → ${p.id}`).join("\n") || "- (ninguno)";

  const result = await generateJson({
    system: SYSTEM,
    prompt: `CUADERNOS\n${cuadernos}\n\nPROYECTOS\n${proyectos}\n\nLO QUE ESCRIBIÓ\n${input.texto}`,
    schema: ESQUEMA,
    budget: CENTRO_BUDGET,
    validate: (raw) => {
      const parsed = Respuesta.safeParse(raw);
      return parsed.success
        ? ({ ok: true, value: parsed.data } as const)
        : ({ ok: false, reason: "El modelo no contestó con la forma esperada." } as const);
    }
  });

  if (!result.ok || !result.data) return { ok: false, reason: result.reason ?? "El modelo no contestó." };
  return { ok: true, cruda: result.data as CapturaCruda };
}
