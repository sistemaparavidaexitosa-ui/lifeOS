import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireAnthropicApiKey } from "@/config/env";

/**
 * Cliente del modelo. Único lugar del proyecto que instancia el SDK.
 *
 * El secreto se valida de forma PEREZOSA (F11): esta función solo se llama
 * desde la acción que genera recomendaciones, así que ninguna otra parte de la
 * app se rompe si `ANTHROPIC_API_KEY` no está definida.
 */
export function anthropic(): Anthropic {
  return new Anthropic({ apiKey: requireAnthropicApiKey() });
}

/**
 * Modelo y ajustes del motor, en un solo sitio para que se puedan cambiar sin
 * tocar la lógica. `effort: "high"` y pensamiento adaptativo porque la tarea
 * —conectar dominios y priorizar— es de criterio, no de redacción.
 */
export const MODEL = "claude-opus-5";
export const EFFORT = "high" as const;
export const MAX_TOKENS = 8000;
