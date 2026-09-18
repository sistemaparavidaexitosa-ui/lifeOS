// src/lib/domain/identity/respaldo.ts
// Cuándo se cae al respaldo — lógica pura (probada en
// tests/domain/identity-respaldo.test.ts).
//
// POR QUÉ ESTO ES UNA FUNCIÓN Y NO UN `if` DENTRO DE `manifestacion.ts`.
//
// Es la regla de la que depende que nadie se quede sin brief, y vivía enterrada
// entre un `fetch` y un `try/catch`, donde no se puede probar: `manifestacion.ts`
// lleva `server-only`, habla con la red y necesita un cliente de Supabase. Sacar
// la DECISIÓN —y solo la decisión— la deja bajo `pnpm verify`.
//
// La distinción que hay que acertar es una sola, y es fácil equivocarse:
// **hay fallos del agente y fallos de la persona**. Un agente caído, lento o que
// devuelve basura son fallos del agente, y el respaldo los arregla. Que alguien
// no haya dicho todavía en quién se está convirtiendo NO lo arregla el respaldo:
// fallaría igual, con el mismo mensaje, después de gastar otra llamada al
// modelo. Confundirlos convierte un aviso claro en diez segundos de espera y un
// «no se pudo».

export type MotivoRespaldo =
  /** No hay agente configurado. Ni se intenta: ni un `fetch` ni un milisegundo. */
  | "sin-configurar"
  | "timeout"
  | "red"
  | "http-5xx"
  | "payload-invalido"
  /** Contestó, pero lo que devolvió no sobrevivió al saneado. */
  | "no-paso-el-saneado";

export type Decision =
  /** Escribe el respaldo, por este motivo. */
  | { respaldo: true; motivo: MotivoRespaldo }
  /** No se cae: esto hay que decírselo a la persona tal cual. */
  | { respaldo: false };

/**
 * El 409 y solo el 409 se propaga.
 *
 * Es el código con el que el agente dice «esto no es cosa mía»: falta identidad
 * declarada, o la IA está apagada para estos dominios. Cualquier otro estado
 * —incluido un 4xx raro— significa que el agente no supo contestar, y ahí el
 * respaldo sí tiene algo que aportar.
 */
export function decidirPorEstado(status: number): Decision {
  if (status === 409) return { respaldo: false };
  if (status >= 500) return { respaldo: true, motivo: "http-5xx" };
  return { respaldo: true, motivo: "payload-invalido" };
}

/**
 * Un fallo antes de tener respuesta: timeout o red.
 *
 * Se distinguen porque cuentan historias distintas en `audit_log`. Una racha de
 * «red» es un contenedor caído o una URL mal puesta; una racha de «timeout» es
 * un agente vivo que está tardando demasiado, que es un problema de otro tipo y
 * se arregla de otra manera.
 */
export function decidirPorExcepcion(error: unknown): Decision {
  const abortada = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  return { respaldo: true, motivo: abortada ? "timeout" : "red" };
}

/**
 * ¿Merece la pena llamar al agente?
 *
 * Sin URL no se intenta nada. Y sin secreto tampoco: una URL sin su secreto es
 * una configuración a medias que produciría un 401 garantizado, y gastar un
 * viaje de red para descubrirlo retrasa el respaldo sin ganar nada. Se trata
 * como «no hay agente» en vez de como un error porque el producto funciona
 * igual y no hay motivo para estropearle la mañana a nadie por una variable que
 * falta.
 */
export function hayAgente(url: string | null, secreto: string | null): boolean {
  return Boolean(url && secreto);
}
