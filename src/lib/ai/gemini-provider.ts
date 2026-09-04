import "server-only";
import { requireGeminiApiKey } from "@/config/env";

/**
 * EL ÚNICO SITIO DEL PROYECTO QUE HABLA CON UN MODELO.
 *
 * POR QUÉ UN SOLO PROVEEDOR, Y POR QUÉ ESTE
 * Hubo dos a la vez y estaba justificado en su momento (D-075): el motor de
 * recomendaciones nació en Anthropic y el planificador de proyectos en OpenAI,
 * cada uno con su secreto y su archivo. Dos proveedores para dos features es
 * dos facturas, dos formas de fallar y dos SDK que mantener al día. Ahora los
 * dos —y el chat— salen por aquí, contra el free tier de Gemini.
 *
 * POR QUÉ `fetch` Y NO EL SDK
 * No es ahorro por ahorro. `recommend.ts` importaba `zod/v4` y
 * `plan-project.ts` la `zod` clásica porque el helper de esquemas de cada SDK
 * revienta con el núcleo del otro (D-027, D-075): una división que no venía de
 * nuestro código sino de sus dependencias, y que obligaba a escribir en la
 * cabecera de los dos archivos que NO se podían unificar. Sin helpers de SDK
 * el problema desaparece: todo el repo vuelve a una sola `zod`, y caen dos
 * dependencias de runtime (`openai`, `@anthropic-ai/sdk`) — que es la
 * dirección que pide D-008.
 *
 * NUNCA LANZA. Mismo contrato que `sendEmail` (D-021) y que las funciones a
 * las que sustituye: un proveedor caído, sin cuota o lento no puede tumbar la
 * página de dinero ni el tablero de proyectos, que se usan sin IA todos los
 * días. Todo sale por `{ ok: false, reason }`, con un motivo que se le pueda
 * enseñar al usuario tal cual.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Modelo y ajustes, en un solo sitio para poder cambiarlos sin tocar la
 * lógica: era el cambio de UNA línea que se prometió aquí, y a los pocos días
 * hizo falta.
 *
 * Se estrenó con `gemini-2.5-flash` y la API lo retiró para cuentas nuevas —
 * «no longer available to new users», con `gemini-3.6-flash` como sucesor
 * nombrado en el propio mensaje de error. Que ese mensaje llegara íntegro hasta
 * la pantalla, y no convertido en un «no se pudo» genérico, es exactamente para
 * lo que `httpReason` devuelve el `detalle` de la API: el diagnóstico vino
 * dicho, no hubo que buscarlo.
 *
 * Un modelo retirado no avisa antes. Si vuelve a pasar, el síntoma es el mismo
 * y el arreglo también: esta línea.
 */
export const GEMINI_MODEL = "gemini-3.6-flash";

/**
 * Un modelo con pensamiento gasta tokens de razonamiento CONTRA el mismo tope
 * que la respuesta. Por eso cada feature declara las dos cifras juntas y no
 * solo el tope: un presupuesto de pensamiento demasiado cerca del techo
 * produce el peor fallo posible —`MAX_TOKENS` con el texto vacío—, que no es
 * un error de red y hay que detectar a mano.
 */
export interface Budget {
  /** Tope TOTAL: pensamiento + respuesta. */
  maxOutputTokens: number;
  /** Cuánto de ese tope puede gastar pensando. 0 lo desactiva. */
  thinkingBudget: number;
}

/** Estructurar un proyecto es criterio, pero acotado: no hace falta más. */
export const PLAN_BUDGET: Budget = { maxOutputTokens: 8000, thinkingBudget: 2048 };

/** Priorizar y conectar dominios es la tarea más de criterio de las tres. */
export const RECOMMEND_BUDGET: Budget = { maxOutputTokens: 12000, thinkingBudget: 4096 };

/**
 * Un turno de chat se responde en párrafos, no en informes.
 *
 * EL PENSAMIENTO BAJA AL MÍNIMO, y no por ahorrar tokens: se paga en espera.
 * Los de razonamiento se generan ANTES de la primera letra de la respuesta, y
 * el chat no los necesita — la regla número uno de su prompt es «NO calcules
 * nada», porque las cifras llegan ya calculadas en los hechos. Lo que hace el
 * modelo aquí es elegir cuáles vienen a cuento y redactarlos; con 1024 tokens
 * de presupuesto el usuario esperaba por un razonamiento que no se le pidió.
 *
 * 128 y no 0: apagarlo del todo es lo más rápido, pero ningún valor de
 * `thinkingConfig` está ejercitado todavía contra este modelo (CHECKS.md), y
 * si rechazara el 0 se caería el chat entero. 128 es el suelo documentado para
 * los `flash` y es el mismo tipo de valor que ya funciona. Si algún día se
 * confirma que admite 0, esa es la línea.
 */
export const CHAT_BUDGET: Budget = { maxOutputTokens: 3000, thinkingBudget: 128 };

/**
 * Ni un modelo lento puede dejar un botón girando para siempre. Mismo criterio
 * que `AUTH_DEADLINE_MS` en el middleware.
 */
const TIMEOUT_MS = 60_000;

/**
 * El subconjunto de OpenAPI 3.0 que admite `responseSchema`.
 *
 * Se declara aquí en vez de aceptar `unknown` para que un campo que la API no
 * entiende se caiga en `tsc` y no en producción. Dos ausencias que sorprenden
 * y por eso se nombran: **no existe `additionalProperties`** (el modo es
 * estricto de todas formas) y `propertyOrdering` no es decorativo — sin él el
 * orden de las claves puede bailar entre llamadas idénticas.
 */
export interface GeminiSchema {
  /**
   * EN MAYÚSCULAS, y no es cosmético: el cuerpo se parsea como JSON de
   * protobuf, donde un valor de enum se casa por su NOMBRE exacto. `"string"`
   * en minúscula no es el nombre de nada y se rechaza con un 400 antes de
   * llegar al modelo.
   */
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  description?: string;
  enum?: string[];
  /** `"enum"` acompaña siempre a un `enum` de tipo STRING; es la forma documentada. */
  format?: string;
  nullable?: boolean;
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  propertyOrdering?: string[];
}

export interface GenerateJsonInput<T> {
  system: string;
  prompt: string;
  /** La forma que se le PIDE al modelo. */
  schema: GeminiSchema;
  /**
   * La forma que se le EXIGE a la respuesta, normalmente un `safeParse` de
   * zod. El esquema de arriba guía; este garantiza. Tenerlos separados es lo
   * que hace que una deriva entre ambos salte aquí y no en la pantalla.
   */
  validate: (raw: unknown) => { ok: true; value: T } | { ok: false; reason: string };
  budget: Budget;
  model?: string;
}

export interface GenerateJsonResult<T> {
  ok: boolean;
  data?: T;
  reason?: string;
}

/** Lo que interesa de la respuesta. El resto de campos se ignoran. */
interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

function httpReason(status: number, body: GeminiResponse | null): string {
  const detalle = body?.error?.message?.trim();
  // El 429 no es una anomalía aquí: es el free tier haciendo su trabajo, y el
  // usuario tiene que poder distinguirlo de «se rompió algo».
  if (status === 429) return "Se agotó la cuota gratuita del modelo por ahora. Inténtalo de nuevo en un minuto.";
  if (status === 401 || status === 403) return "La llave de Gemini no es válida o no tiene permiso — ver /docs/DEPLOY.md.";
  if (status >= 500) return "El modelo no está disponible en este momento. Inténtalo otra vez.";
  return detalle ? `El modelo rechazó la petición: ${detalle}` : `El modelo respondió con un error (HTTP ${status}).`;
}

export async function generateJson<T>(input: GenerateJsonInput<T>): Promise<GenerateJsonResult<T>> {
  let apiKey: string;
  try {
    apiKey = requireGeminiApiKey();
  } catch (error) {
    // La validación perezosa (F11) lanza; el contrato de este módulo es no
    // lanzar. Se traduce aquí, una sola vez, en vez de en cada llamador.
    return { ok: false, reason: error instanceof Error ? error.message : "Falta GEMINI_API_KEY." };
  }

  const model = input.model ?? GEMINI_MODEL;

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: input.schema,
          maxOutputTokens: input.budget.maxOutputTokens,
          thinkingConfig: { thinkingBudget: input.budget.thinkingBudget }
        }
      })
    });
  } catch (error) {
    const abortada = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      reason: abortada
        ? "El modelo tardó demasiado en responder. Inténtalo otra vez."
        : error instanceof Error
          ? error.message
          : "No se pudo contactar con el modelo."
    };
  }

  let body: GeminiResponse | null = null;
  try {
    body = (await response.json()) as GeminiResponse;
  } catch {
    body = null;
  }

  if (!response.ok) return { ok: false, reason: httpReason(response.status, body) };
  if (!body) return { ok: false, reason: "El modelo devolvió una respuesta ilegible." };

  // Las tres formas de fallar SIN error HTTP, y por eso se comprueban a mano.
  // Sin esto el usuario vería un «no se pudo» genérico que no dice qué hacer.
  if (body.promptFeedback?.blockReason) {
    return { ok: false, reason: `El modelo no quiso responder a esto (${body.promptFeedback.blockReason}).` };
  }

  const candidate = body.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish && finish !== "STOP") {
    return {
      ok: false,
      reason:
        finish === "MAX_TOKENS"
          ? "La respuesta salió demasiado larga y se cortó. Prueba con algo más acotado."
          : `El modelo no pudo terminar la respuesta (${finish}). Inténtalo otra vez.`
    };
  }

  // Las partes se concatenan: una respuesta larga puede venir troceada, y
  // quedarse con la primera devolvería un JSON cortado a media llave.
  const text = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) return { ok: false, reason: "El modelo devolvió una respuesta vacía." };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "El modelo no devolvió JSON válido." };
  }

  const validated = input.validate(raw);
  if (!validated.ok) return { ok: false, reason: validated.reason };

  return { ok: true, data: validated.value };
}
