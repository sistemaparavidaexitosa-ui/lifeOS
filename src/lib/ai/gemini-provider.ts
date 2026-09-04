import "server-only";
import { requireGeminiApiKey } from "@/config/env";
import { debeSaltarDeModelo, motivoCadenaAgotada, problemasDeEsquema } from "@/lib/domain/ai/model-chain.ts";

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
export const GEMINI_MODELS = ["gemini-3.1-flash-lite", "gemini-3.6-flash"] as const;

/**
 * El primero de la cadena, para quien solo necesite nombrar «el modelo». No es
 * el que contesta necesariamente: eso lo dice `GenerateJsonResult.model`, y es
 * lo que hay que registrar en `audit_log`.
 */
export const GEMINI_MODEL = GEMINI_MODELS[0];

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

/**
 * Una herramienta declarada al modelo. `parameters` reusa `GeminiSchema`
 * —el mismo dialecto de `responseSchema`— porque es el mismo subconjunto de
 * OpenAPI: dos tipos para la misma forma sería una deriva esperando a pasar.
 */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: GeminiSchema;
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
  /**
   * Cadena a recorrer. Por defecto `GEMINI_MODELS`; se pasa a mano solo para
   * probar el salto o para acotar una feature a un modelo concreto.
   */
  models?: readonly string[];
  /**
   * Lo que el modelo puede pedir antes de contestar. Ausente en `recommend` y
   * `plan-project`: los dos reciben todo lo que necesitan en el prompt y no
   * tienen nada que preguntar.
   */
  tools?: FunctionDeclaration[];
  /**
   * Ejecuta la herramienta EN EL SERVIDOR y devuelve lo que verá el modelo. Lo
   * proporciona quien llama, no este módulo: aquí no se sabe qué es un
   * `user_id` ni se puede tocar Supabase, y así sigue.
   */
  executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface GenerateJsonResult<T> {
  ok: boolean;
  data?: T;
  reason?: string;
  /**
   * El modelo que DE VERDAD contestó (o el que falló sin dejar seguir). Sin
   * esto, `audit_log` registraría el primero de la cadena aunque hubiera
   * respondido el segundo — un registro que miente es peor que no tenerlo.
   */
  model?: string;
}

/** Lo que interesa de la respuesta. El resto de campos se ignoran. */
/**
 * Una parte de la respuesta. Se declara ABIERTA (`[k: string]: unknown`) a
 * propósito: la serie Gemini 3 mete aquí un `thoughtSignature` que hay que
 * devolver **idéntico** en la siguiente llamada o la API responde 400
 * («Function call is missing a thought_signature»). Los SDK lo hacen solos;
 * como aquí no hay SDK (D-087), la defensa es no reconstruir nunca el turno
 * del modelo y reenviar el objeto tal cual llegó.
 */
interface GeminiPart {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  [clave: string]: unknown;
}

interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
  [clave: string]: unknown;
}

/** Lo que interesa de la respuesta. El resto de campos se ignoran. */
interface GeminiResponse {
  candidates?: {
    content?: GeminiContent;
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

/**
 * Lo que devuelve UN intento contra UN modelo. El `status` es lo que decide si
 * la cadena sigue: sin él —fallo de red, de forma o de validación— no hay nada
 * que el siguiente modelo vaya a hacer mejor.
 */
interface Intento<T> {
  ok: boolean;
  data?: T;
  reason?: string;
  status?: number;
  /** El turno del modelo pidiendo herramientas, para reenviarlo verbatim. */
  pide?: GeminiContent;
}

/**
 * Cuántas veces se le deja pedir datos antes de exigirle una respuesta.
 *
 * Dos, y no «las que haga falta»: cada ronda es una llamada entera contra la
 * cuota y varios segundos de espera con el «Pensando…» puesto. Un modelo que
 * no ha reunido lo que necesita en dos rondas normalmente está dando vueltas,
 * no investigando.
 */
const MAX_RONDAS_HERRAMIENTAS = 2;

async function intentarConModelo<T>(
  input: GenerateJsonInput<T>,
  apiKey: string,
  model: string,
  contents: GeminiContent[],
  conHerramientas: boolean
): Promise<Intento<T>> {
  const cuerpo: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: input.system }] },
    contents,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: input.schema,
      maxOutputTokens: input.budget.maxOutputTokens,
      thinkingConfig: { thinkingBudget: input.budget.thinkingBudget }
    }
  };
  if (conHerramientas && input.tools?.length) {
    cuerpo.tools = [{ functionDeclarations: input.tools }];
  }

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify(cuerpo)
    });
  } catch (error) {
    const abortada = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    // Sin `status`: un timeout NO encadena. Son 60 s por modelo, y dos
    // seguidos son dos minutos con el botón girando — peor que el fallo.
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

  if (!response.ok) return { ok: false, reason: httpReason(response.status, body), status: response.status };
  if (!body) return { ok: false, reason: "El modelo devolvió una respuesta ilegible." };

  // Las tres formas de fallar SIN error HTTP, y por eso se comprueban a mano.
  // Sin esto el usuario vería un «no se pudo» genérico que no dice qué hacer.
  if (body.promptFeedback?.blockReason) {
    return { ok: false, reason: `El modelo no quiso responder a esto (${body.promptFeedback.blockReason}).` };
  }

  const candidate = body.candidates?.[0];
  const partes = candidate?.content?.parts ?? [];

  // ¿Pide datos antes de contestar? Se devuelve el turno ENTERO, sin tocarlo.
  if (partes.some((p) => p.functionCall)) return { ok: false, pide: candidate?.content };

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
  const text = partes
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

/**
 * La conversación completa con UN modelo: las rondas de herramientas que pida
 * (hasta el tope) y la respuesta final.
 */
async function conversarConModelo<T>(
  input: GenerateJsonInput<T>,
  apiKey: string,
  model: string,
  conHerramientas: boolean
): Promise<Intento<T>> {
  const contents: GeminiContent[] = [{ role: "user", parts: [{ text: input.prompt }] }];

  for (let ronda = 0; ronda <= MAX_RONDAS_HERRAMIENTAS; ronda += 1) {
    // En la última vuelta se le quitan las herramientas: es lo que convierte el
    // tope en «ahora contesta» en vez de en un error.
    const ultima = ronda === MAX_RONDAS_HERRAMIENTAS;
    const intento = await intentarConModelo(input, apiKey, model, contents, conHerramientas && !ultima);

    if (intento.ok || !intento.pide) return intento;

    // El turno del modelo se reenvía VERBATIM (con su `thoughtSignature`).
    contents.push(intento.pide);
    const respuestas: GeminiPart[] = [];
    for (const parte of intento.pide.parts ?? []) {
      const llamada = parte.functionCall;
      if (!llamada?.name) continue;
      const salida = input.executeTool
        ? await input.executeTool(llamada.name, llamada.args ?? {})
        : { error: "Esta herramienta no está disponible." };
      respuestas.push({ functionResponse: { name: llamada.name, response: { resultado: salida } } } as GeminiPart);
    }
    contents.push({ role: "user", parts: respuestas });
  }

  return { ok: false, reason: "El modelo se quedó pidiendo datos y no llegó a contestar." };
}

/**
 * Recorre la cadena de modelos. El primero que conteste, contesta; y si uno
 * falla por algo que el siguiente puede arreglar —cuota, retirada, caída—, se
 * pasa al siguiente sin que el usuario se entere.
 *
 * El contrato de D-021 no cambia: NUNCA LANZA.
 */
export async function generateJson<T>(input: GenerateJsonInput<T>): Promise<GenerateJsonResult<T>> {
  let apiKey: string;
  try {
    apiKey = requireGeminiApiKey();
  } catch (error) {
    // La validación perezosa (F11) lanza; el contrato de este módulo es no
    // lanzar. Se traduce aquí, una sola vez, en vez de en cada llamador.
    return { ok: false, reason: error instanceof Error ? error.message : "Falta GEMINI_API_KEY." };
  }

  // El esquema se revisa ANTES de salir a la red. Un `responseSchema` mal
  // formado no mejora con otro modelo ni con otro intento: es un bug nuestro, y
  // descubrirlo por el 400 de la API cuesta una llamada y le enseña al usuario
  // un mensaje que no puede interpretar. Pasó con un `enum` que llevaba una
  // cadena vacía dentro (D-106).
  const problemas = [
    ...problemasDeEsquema(input.schema),
    // Las herramientas llevan su propio esquema y son la misma clase de bug.
    ...(input.tools ?? []).flatMap((t) => problemasDeEsquema(t.parameters, `herramienta ${t.name}`))
  ];
  if (problemas.length) {
    return { ok: false, reason: `El esquema de la petición está mal formado: ${problemas.join(" ")}` };
  }

  const modelos = input.models ?? GEMINI_MODELS;
  let ultimo: Intento<T> = { ok: false, reason: "No hay ningún modelo configurado." };
  let agotadosPorCuota = 0;

  for (const model of modelos) {
    let intento = await conversarConModelo(input, apiKey, model, true);

    // RED DE SEGURIDAD. Combinar `tools` con `responseSchema` está documentado
    // para la serie Gemini 3, pero en este repo no hay una sola llamada real
    // ejercitada (CHECKS.md) y el chat vive en TODAS las pantallas. Si la
    // petición con herramientas se rechaza por forma, se reintenta sin ellas:
    // vale mil veces más una respuesta sin datos frescos que un rail roto.
    if (!intento.ok && intento.status === 400 && input.tools?.length) {
      intento = await conversarConModelo(input, apiKey, model, false);
    }

    if (intento.ok) return { ok: true, data: intento.data, model };

    ultimo = intento;
    if (intento.status === 429) agotadosPorCuota += 1;
    if (intento.status === undefined || !debeSaltarDeModelo(intento.status)) {
      // Ni la llave ni un esquema mal formado mejoran con otro modelo: se
      // devuelve el motivo tal cual, que es lo que hizo legible el episodio
      // del modelo retirado.
      return { ok: false, reason: intento.reason, model };
    }
  }

  // Si TODOS cayeron por cuota, el mensaje de un solo modelo sería mentira.
  const reason = agotadosPorCuota === modelos.length ? motivoCadenaAgotada(modelos.length) : ultimo.reason;
  return { ok: false, reason };
}
