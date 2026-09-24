import "server-only";
import { groqApiKey } from "@/config/env";
import type { Budget } from "@/lib/domain/ai/model-chain.ts";
import { cuerpoDeGroq, debeProbarSiguiente, GROQ_MODELS } from "@/lib/domain/ai/groq.ts";

// EL RESPALDO DE LA CADENA (D-182).
//
// POR QUÉ SE REVIERTE D-087 A MEDIAS
// D-087 fijó «un solo proveedor y sin SDK» y sigue siendo buena: dos
// proveedores para dos features eran dos facturas y dos SDK. Esto es otra cosa
// —un solo camino, `generateJson`, con un segundo proveedor DETRÁS del
// primero— y responde a un problema medido, no teórico: el `audit_log` de
// producción enseña el coach corriendo dos veces en once segundos, y Gemini
// corre sobre el free tier, que devuelve 429 por diseño (D-087 lo dice: «no es
// una anomalía, es el plan gratuito haciendo su trabajo»). Cuando la cadena de
// Gemini se agota, hoy el usuario se queda sin respuesta. Con esto, no.
//
// La parte de D-087 que NO se revierte: sin SDK. Groq habla la API de OpenAI,
// así que es el mismo `fetch` de siempre y cero dependencias nuevas (D-008).
//
// QUÉ PIERDE GROQ RESPECTO A GEMINI, Y POR QUÉ SE ACEPTA
//  1. **Sin `responseSchema`.** Se le pide JSON con `response_format` y el
//     esquema va descrito en el prompt. No importa: en este repo el esquema
//     GUÍA y `input.validate` GARANTIZA —está escrito así en
//     `GenerateJsonInput`— así que la forma se sigue exigiendo igual.
//  2. **Sin herramientas.** Mapear `FunctionDeclaration` de Gemini a las de
//     OpenAI es trabajo de verdad y este es un respaldo. Hay precedente exacto:
//     cuando una petición con herramientas se rechaza por forma, el proveedor
//     de Gemini reintenta sin ellas porque «vale mil veces más una respuesta
//     sin datos frescos que un rail roto». Lo mismo aquí.
//  3. **Sin `buscar_en_internet`.** Es grounding de Gemini; Groq no lo tiene.
//
// NUNCA LANZA, como todo lo que rodea al modelo (D-021).

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/** Mismo tope que el resto de la casa: un modelo lento no deja un botón girando. */
const TIMEOUT_MS = 60_000;

export interface IntentoDeRespaldo {
  ok: boolean;
  raw?: unknown;
  reason?: string;
  model?: string;
}

/**
 * Un turno contra Groq. Devuelve `null` —no un fallo— si no hay llave: no
 * tener respaldo configurado no es un error, es no tenerlo.
 */
export async function intentarConGroq(input: {
  system: string;
  prompt: string;
  esquema: unknown;
  budget: Budget;
}): Promise<IntentoDeRespaldo | null> {
  const key = groqApiKey();
  if (!key) return null;

  let ultimo = "El respaldo no contestó.";

  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify(
          cuerpoDeGroq({
            model,
            system: input.system,
            prompt: input.prompt,
            esquema: input.esquema,
            maxOutputTokens: input.budget.maxOutputTokens
          })
        )
      });

      if (!res.ok) {
        const detalle = await res.text().catch(() => "");
        ultimo = `El respaldo respondió ${res.status}. ${detalle.slice(0, 200)}`.trim();
        // 429, 5xx o modelo retirado: el siguiente de la cadena puede estar
        // bien. La llave o una petición mal formada fallarían igual.
        if (debeProbarSiguiente(res.status, detalle)) continue;
        return { ok: false, reason: ultimo, model };
      }

      const body = (await res.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
      };
      const eleccion = body.choices?.[0];
      const texto = eleccion?.message?.content?.trim();

      if (eleccion?.finish_reason === "length") {
        return { ok: false, reason: "La respuesta del respaldo se cortó por longitud.", model };
      }
      if (!texto) {
        ultimo = "El respaldo devolvió una respuesta vacía.";
        continue;
      }

      try {
        return { ok: true, raw: JSON.parse(texto), model };
      } catch {
        // El modo JSON de Groq lo hace raro, pero puede pasar. No se reintenta
        // con otro modelo: quien llama tiene `validate` y sabrá decirlo mejor.
        return { ok: false, reason: "El respaldo no devolvió JSON válido.", model };
      }
    } catch (error) {
      ultimo = error instanceof Error && error.name === "TimeoutError"
        ? "El respaldo tardó demasiado."
        : "No se pudo hablar con el respaldo.";
      // Un timeout NO encadena, igual que en el proveedor principal: son 60 s
      // por modelo y dos esperas seguidas son dos minutos mirando una pantalla.
      return { ok: false, reason: ultimo, model };
    }
  }

  return { ok: false, reason: ultimo };
}
