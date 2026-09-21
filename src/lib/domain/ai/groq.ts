// src/lib/domain/ai/groq.ts
// Lo que se puede decidir del respaldo sin salir a la red (D-182) — puro,
// probado en tests/domain/ai-groq.test.ts.

/**
 * La cadena de Groq, de más capaz a más rápido.
 *
 * Dos y no uno por el mismo motivo que Gemini tiene dos: un modelo retirado no
 * avisa antes, y ya pasó una vez (`gemini-2.5-flash` se llevó por delante las
 * tres funciones de IA). Aquí además el segundo es el seguro contra el 429 del
 * primero, que es justo el caso para el que existe todo este archivo.
 */
export const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"] as const;

/**
 * El esquema, descrito en el prompt.
 *
 * Groq no tiene `responseSchema`: se le pide JSON con `response_format` y la
 * forma se describe con palabras. Eso bastaría para que devolviera cualquier
 * cosa parecida — pero no importa, porque en este repo el esquema GUÍA y
 * `input.validate` GARANTIZA. La forma se sigue exigiendo con el mismo
 * `safeParse` de zod que con Gemini; lo único que cambia es qué tan bien
 * acierta el modelo a la primera.
 *
 * Se serializa el esquema tal cual en vez de traducirlo a prosa: es más corto,
 * más exacto, y una traducción a mano sería un segundo sitio donde el esquema
 * puede quedarse viejo.
 */
export function promptConEsquema(system: string, esquema: unknown): string {
  return [
    system,
    "",
    "Responde ÚNICAMENTE con un objeto JSON válido que siga exactamente esta forma.",
    "No escribas texto antes ni después del JSON, ni lo envuelvas en un bloque de código.",
    JSON.stringify(esquema)
  ].join("\n");
}
