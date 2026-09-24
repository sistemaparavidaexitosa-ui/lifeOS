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
export const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] as const;

/**
 * Lo que Groq ya apagó, según console.groq.com/docs/deprecations (leído el
 * 2026-09-24). Está aquí para que una prueba impida volver a ponerlos.
 *
 * LA LECCIÓN. La cadena era `llama-3.3-70b-versatile` → `llama-3.1-8b-instant`,
 * y Groq apagó LOS DOS el 16-ago-2026: el respaldo llevaba cinco semanas
 * devolviendo error. Tener dos modelos no protege si se retiran juntos, y el
 * segundo ni siquiera se probaba: un 400 cortaba la cadena (ver
 * `debeProbarSiguiente`).
 */
export const RETIRADOS_DE_GROQ = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "qwen/qwen3-32b",
  "qwen/qwen3.6-27b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "moonshotai/kimi-k2-instruct-0905",
  "groq/compound",
  "groq/compound-mini"
] as const;

/**
 * Tokens de más para el razonamiento. Los `gpt-oss` razonan antes de contestar
 * y ese razonamiento cuenta contra `max_completion_tokens`: con el tope justo
 * de la respuesta, se cortaban por longitud antes de escribir el JSON.
 */
export const RESERVA_RAZONAMIENTO = 1024;

/** El cuerpo de la petición a Groq, sin red: se prueba aquí y no en producción. */
export function cuerpoDeGroq(input: {
  model: string;
  system: string;
  prompt: string;
  esquema: unknown;
  maxOutputTokens: number;
}) {
  return {
    model: input.model,
    max_completion_tokens: input.maxOutputTokens + RESERVA_RAZONAMIENTO,
    temperature: 0.7,
    response_format: { type: "json_object" as const },
    // Poco razonamiento: esto es el RESPALDO, y un respaldo lento no ayuda.
    reasoning_effort: "low" as const,
    // En modo JSON Groq exige `parsed` o `hidden`; `hidden` deja `content`
    // solo con el JSON.
    reasoning_format: "hidden" as const,
    messages: [
      { role: "system" as const, content: promptConEsquema(input.system, input.esquema) },
      { role: "user" as const, content: input.prompt }
    ]
  };
}

/**
 * ¿Vale la pena el siguiente modelo de la cadena?
 *
 * Sí ante 429 y 5xx, como antes. Y TAMBIÉN cuando el modelo no existe o está
 * retirado: ese es justo el fallo para el que la cadena tiene dos. Antes un 400
 * de modelo retirado cortaba la cadena y el segundo modelo nunca se probaba. La
 * llave mala o una petición mal formada fallarían igual con otro modelo.
 */
export function debeProbarSiguiente(status: number, detalle: string): boolean {
  if (status === 429 || status >= 500 || status === 404) return true;
  return /model_decommissioned|model_not_found|decommissioned|does not exist/i.test(detalle);
}

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
