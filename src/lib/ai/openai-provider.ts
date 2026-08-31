import "server-only";
import OpenAI from "openai";
import { requireOpenAiApiKey } from "@/config/env";

/**
 * Cliente de OpenAI. Único lugar del proyecto que instancia este SDK, igual
 * que `provider.ts` lo es para el de Anthropic.
 *
 * POR QUÉ HAY DOS PROVEEDORES Y NO UNO
 * No es un descuido: está en D-075. El motor de recomendaciones (Intelligence
 * OS) se construyó sobre Anthropic y funciona; migrarlo para unificar sería
 * reescribir código probado sin ganar nada. El generador de planes nace en
 * OpenAI. Cada uno vive en su archivo, con su secreto y su validación
 * perezosa, y ninguno puede tumbar al otro.
 *
 * El secreto se valida de forma PEREZOSA (F11): esta función solo se llama
 * desde la acción que genera un plan.
 */
export function openai(): OpenAI {
  return new OpenAI({ apiKey: requireOpenAiApiKey() });
}

/**
 * Modelo y ajustes, en un solo sitio para poder cambiarlos sin tocar la
 * lógica. `gpt-5.6` es el alias de la variante insignia; si el coste llega a
 * importar, `gpt-5.6-terra` es el cambio de UNA línea que hay que hacer aquí.
 */
export const PLAN_MODEL = "gpt-5.6";

/**
 * Un plan tope —6 grupos, 30 tareas, subtareas— cabe de sobra en esto. Se
 * acota para que una respuesta que se desmadre se corte y salga por la rama de
 * `incomplete`, en vez de facturar sin límite.
 */
export const PLAN_MAX_OUTPUT_TOKENS = 4000;
