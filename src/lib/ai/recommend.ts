import "server-only";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, EFFORT, MAX_TOKENS, MODEL } from "./provider";
import { validateAnchoring, type DraftRecommendation } from "@/lib/domain/insights/anchoring.ts";
import type { InsightContext } from "@/lib/insights/context";

/**
 * Genera recomendaciones a partir de un contexto ya filtrado.
 *
 * Esta capa NUNCA ve una fila cruda de la base ni importa Supabase: recibe
 * hechos ya calculados y seudonimizados, y devuelve texto. No puede calcular
 * —no tiene con qué— ni aplicar nada.
 *
 * `zod/v4` a propósito: `zodOutputFormat` del SDK convierte el esquema con el
 * núcleo v4 de zod, y un esquema de la zod clásica revienta al convertirse.
 * Se importa el subpath solo aquí; el resto de la app sigue en `zod` clásica
 * (ver D-027).
 */

const RecommendationSchema = z.object({
  type: z.string().describe("Etiqueta corta y estable del tipo de recomendación, en minúsculas. Ej: 'presupuesto', 'gasto-atipico', 'ingreso-sin-asignar'."),
  text: z.string().describe("La recomendación en español, en dos o tres frases, dirigida al usuario. Concreta y accionable."),
  confidence: z.enum(["Alta", "Media", "Baja"]),
  impact: z.enum(["Alto", "Medio", "Bajo"]),
  factIds: z.array(z.string()).describe("Los id EXACTOS de los hechos que sustentan esta recomendación. Obligatorio: al menos uno, y todos deben existir en la lista de hechos entregada."),
  assumptions: z.array(z.string()).describe("Supuestos que hiciste, si los hay. Vacío si no hiciste ninguno.")
});

const ResponseSchema = z.object({
  recommendations: z.array(RecommendationSchema)
});

const SYSTEM = `Eres el motor de recomendaciones de Life OS, un sistema personal de gestión de vida.

Recibes HECHOS ya calculados por el sistema a partir de los datos reales del usuario. Tu trabajo es priorizarlos, conectarlos y redactarlos como recomendaciones útiles en español.

Reglas que no puedes romper:
- NO calcules nada. Los números ya vienen en los hechos; úsalos tal cual. Si una cifra no está en un hecho, no existe.
- CADA recomendación debe citar en 'factIds' los id exactos de los hechos que la sustentan. Una recomendación sin respaldo se descarta automáticamente.
- No repitas recomendaciones que el usuario ya rechazó; se te entregan abajo si las hay.
- Prefiere pocas recomendaciones buenas a muchas obvias. Si los hechos no dan para nada útil, devuelve una lista vacía: es una respuesta válida y preferible al relleno.
- No inventes contexto sobre la vida del usuario que no esté en los hechos.
- Los nombres de personas y cuentas vienen seudonimizados ('Dependiente #1', 'Cuenta #2'). Úsalos tal cual; no intentes adivinar quiénes son.`;

export interface RecommendResult {
  ok: boolean;
  recommendations: DraftRecommendation[];
  /** Descartadas por falta de anclaje. Se registran para poder auditarlas. */
  dropped: { text: string; reason: string }[];
  reason?: string;
}

function buildPrompt(context: InsightContext): string {
  const facts = context.facts.map((f) => `- id: ${f.id} | ${f.label}`).join("\n");

  // La memoria va ANTES de los rechazos y después de los hechos: es contexto
  // sobre el usuario, no una corrección. Sin ella el motor sugiere
  // indefinidamente cosas que ya fueron decididas (§6).
  const memory = context.memory.length
    ? `\n\nLo que el usuario te ha dicho y debes respetar:\n${context.memory.map((m) => `- ${m}`).join("\n")}`
    : "";

  const rejections = context.rejections.length
    ? `\n\nRecomendaciones que el usuario YA rechazó. No las repitas:\n${context.rejections.map((r) => `- ${r}`).join("\n")}`
    : "";

  // Si hay dominios apagados se dice, para que el modelo no redacte como si
  // tuviera la foto completa (§4.2).
  const skipped = context.skippedDomains.length
    ? `\n\n(El usuario no autorizó estos dominios, así que no tienes sus datos: ${context.skippedDomains.join(", ")}. No especules sobre ellos.)`
    : "";

  const trimmed = context.trimmed > 0 ? `\n\n(Se omitieron ${context.trimmed} hechos menos relevantes.)` : "";

  return `Ámbito del análisis: ${context.scope} (dominios incluidos: ${context.domains.join(", ")}).

HECHOS:
${facts}${memory}${rejections}${skipped}${trimmed}`;
}

export async function recommend(context: InsightContext): Promise<RecommendResult> {
  if (!context.facts.length) {
    return { ok: true, recommendations: [], dropped: [], reason: "No hay nada anómalo que reportar todavía." };
  }

  try {
    const response = await anthropic().messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT, format: zodOutputFormat(ResponseSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(context) }]
    });

    const parsed = response.parsed_output;
    if (!parsed) return { ok: false, recommendations: [], dropped: [], reason: "El modelo no devolvió una respuesta con la forma esperada." };

    // La garantía estructural: nada sin respaldo llega a la base (§3.3).
    const { kept, dropped } = validateAnchoring(parsed.recommendations, context.facts.map((f) => f.id));
    return { ok: true, recommendations: kept, dropped };
  } catch (error) {
    // Mismo contrato que sendEmail (D-021): nunca lanza. Un proveedor caído no
    // puede tumbar la página de dinero.
    return {
      ok: false,
      recommendations: [],
      dropped: [],
      reason: error instanceof Error ? error.message : "Error al consultar el modelo"
    };
  }
}
