// src/lib/domain/ai/model-chain.ts
// La única decisión de la cadena de modelos: ante un fallo, ¿vale la pena
// gastar el siguiente modelo o sería solo espera de más?
//
// Vive aquí, puro y sin red, porque es la parte que se puede probar. El bucle
// que la usa está en `src/lib/ai/gemini-provider.ts`, que sí habla con la API.

/**
 * Saltar al siguiente modelo de la cadena tiene sentido cuando el problema es
 * DE ESTE modelo, y no de la petición ni de la llave.
 *
 * - **429** es la cuota del free tier. No es una anomalía: es el plan gratuito
 *   haciendo su trabajo (D-087), y sumar la cuota del siguiente modelo es
 *   exactamente para lo que existe la cadena.
 * - **404** es el modelo retirado. Ya pasó una vez —`gemini-2.5-flash` dejó de
 *   estar disponible y se llevó por delante las tres funciones de IA— y la
 *   cadena convierte ese incidente en un salto que nadie nota.
 * - **5xx** puede ser de un modelo concreto, y el salto no cuesta nada.
 *
 * Y NO se salta cuando el siguiente modelo fallaría igual:
 *
 * - **401/403** es la llave. Recorrer la cadena entera para recibir el mismo
 *   rechazo solo añade espera antes del mensaje.
 * - **400** es la petición: mismo esquema, mismo rechazo. Además suele ser un
 *   bug nuestro, y esconderlo tras un salto lo hace más difícil de ver — que
 *   es lo contrario de lo que consiguió `httpReason` devolviendo el detalle de
 *   la API tal cual.
 */
export function debeSaltarDeModelo(status: number): boolean {
  if (status === 429) return true;
  if (status === 404) return true;
  return status >= 500;
}

/**
 * El motivo que ve el usuario cuando NINGÚN modelo de la cadena pudo contestar
 * por cuota.
 *
 * Se escribe aparte —y con el número dentro— porque el mensaje de un solo
 * modelo ya no sería cierto: decir «se agotó la cuota, prueba en un minuto»
 * después de haber probado dos modelos promete algo que no va a pasar. Si se
 * agotaron todos, lo honesto es decir que es por hoy.
 */
export function motivoCadenaAgotada(modelos: number): string {
  if (modelos <= 1) {
    return "Se agotó la cuota gratuita del modelo por ahora. Inténtalo de nuevo en un minuto.";
  }
  const cuantos = modelos === 2 ? "dos" : String(modelos);
  return `Se agotó la cuota gratuita de los ${cuantos} modelos por hoy. Vuelve a intentarlo mañana.`;
}
