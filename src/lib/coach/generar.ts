import "server-only";
import { generateJson, COACH_BUDGET } from "@/lib/ai/gemini-provider";
import type { CajaDeHerramientas } from "@/lib/ai/tools";
import type { InsightContext } from "@/lib/insights/context";
import { CoachSchema, COACH_RESPONSE_SCHEMA, systemDelCoach, type Momento } from "./prompt";

/**
 * Un mensaje del coach.
 *
 * Mismo reparto que `chatReply` y por el mismo motivo: esta capa no ve Supabase
 * ni sabe qué es un `user_id`. Recibe hechos ya calculados y devuelve texto;
 * quien la llama decide si algo de esto se guarda.
 *
 * NUNCA LANZA (D-021). Aquí importa distinto que en el chat: no hay nadie
 * mirando una pantalla que pueda reintentar. Una excepción sin atrapar dentro
 * del despachador tumbaría la pasada entera y con ella los recordatorios y los
 * vencimientos del resto de la gente.
 */

export interface CoachPropuesta {
  tipo: string;
  titulo: string;
  detalle: string;
  datos: string;
}

export interface CoachResult {
  ok: boolean;
  /** Una frase: lo que se lee en la notificación. */
  resumen: string;
  /** El mensaje completo: lo que queda en el chat. */
  mensaje: string;
  propuestas: CoachPropuesta[];
  factIds: string[];
  reason?: string;
}

const VACIO: CoachResult = { ok: false, resumen: "", mensaje: "", propuestas: [], factIds: [] };

function contexto(context: InsightContext, momento: Momento, today: string): string {
  const partes: string[] = [`Hoy es ${today}. Es ${momento === "morning" ? "por la mañana" : "por la noche"}.`];

  if (context.facts.length) {
    partes.push(`HECHOS:\n${context.facts.map((f) => `- id: ${f.id} | ${f.label}`).join("\n")}`);
  } else {
    // Decirlo y no callarlo, igual que en el chat: sin esto el modelo redacta
    // como si tuviera la foto completa y se inventa el resto.
    partes.push(
      "HECHOS: ninguno. No hay nada anómalo hoy, o el usuario no tiene datos todavía. Sé honesto y breve; no inventes un día que no conoces."
    );
  }

  if (context.memory.length) {
    partes.push(`Lo que el usuario te ha dicho y debes respetar:\n${context.memory.map((m) => `- ${m}`).join("\n")}`);
  }

  if (context.skippedDomains.length) {
    partes.push(
      `(El usuario apagó estos dominios, así que no tienes sus datos: ${context.skippedDomains.join(", ")}. No especules sobre ellos.)`
    );
  }

  partes.push("Escribe su mensaje.");
  return partes.join("\n\n");
}

export async function generarMensajeCoach(input: {
  context: InsightContext;
  tools?: CajaDeHerramientas;
  momento: Momento;
  today: string;
}): Promise<CoachResult> {
  const result = await generateJson({
    system: systemDelCoach(input.momento),
    prompt: contexto(input.context, input.momento, input.today),
    schema: COACH_RESPONSE_SCHEMA,
    budget: COACH_BUDGET,
    tools: input.tools?.declaraciones,
    executeTool: input.tools?.ejecutar,
    validate: (raw) => {
      const parsed = CoachSchema.safeParse(raw);
      return parsed.success
        ? ({ ok: true, value: parsed.data } as const)
        : ({ ok: false, reason: "El modelo no devolvió un mensaje con la forma esperada." } as const);
    }
  });

  if (!result.ok || !result.data) return { ...VACIO, reason: result.reason };

  const mensaje = result.data.mensaje.trim();
  if (!mensaje) return { ...VACIO, reason: "El coach devolvió un mensaje vacío." };

  // Igual que en el chat: solo los id que de verdad se le dieron. Una cita que
  // no se puede seguir no es una cita, y aquí nadie va a estar delante para
  // notar que el hecho citado no existe.
  const conocidos = new Set([...input.context.facts.map((f) => f.id), ...(input.tools?.entregados() ?? [])]);

  return {
    ok: true,
    // El resumen es lo que sale en la notificación del teléfono, donde el
    // sistema operativo corta sin avisar. Se recorta aquí para que el corte lo
    // decidamos nosotros y no acabe a media palabra.
    resumen: (result.data.resumen.trim() || mensaje).slice(0, 140),
    mensaje,
    propuestas: result.data.propuestas.slice(0, 2),
    factIds: [...new Set(result.data.factIds.filter((id) => conocidos.has(id)))]
  };
}
