// src/lib/domain/identity/token.ts
// El token que ata una lectura de contexto a su guardado — lógica pura sobre
// `node:crypto` (probada en tests/domain/identity-token.test.ts).
//
// QUÉ PROBLEMA RESUELVE, QUE NO ES EL QUE PARECE.
//
// No sustituye al secreto: quien tenga `MANIFESTATION_AGENT_SECRET` puede
// firmar tokens, y eso es inevitable porque el secreto ES la autoridad. Lo que
// impide son los tres errores que un secreto suelto no ve:
//
//   1. **Replay.** Un cuerpo capturado no se puede reenviar mañana: el token
//      caduca a los diez minutos.
//   2. **Cruce de persona.** El guardado comprueba que el token se emitió para
//      ESE `user_id`. Un agente con dos peticiones en vuelo no puede escribir
//      el brief de una en la fila de la otra.
//   3. **Cruce de fecha.** Igual con `local_date`. Un reintento lento que llega
//      pasada la medianoche no escribe el brief de ayer con el contexto de hoy.
//
// Los tres son fallos de concurrencia, no de ataque, y son los que de verdad
// van a pasar.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Diez minutos: de sobra para una generación, poco para reutilizar un token. */
export const VIGENCIA_MS = 10 * 60 * 1000;

export interface Sujeto {
  userId: string;
  localDate: string;
}

function cuerpo(s: Sujeto, emitidoEn: number): string {
  return `${s.userId}|${s.localDate}|${emitidoEn}`;
}

function firma(secreto: string, texto: string): string {
  return createHmac("sha256", secreto).update(texto).digest("base64url");
}

export function firmarToken(secreto: string, sujeto: Sujeto, emitidoEn: number = Date.now()): string {
  const texto = cuerpo(sujeto, emitidoEn);
  return `${Buffer.from(texto, "utf8").toString("base64url")}.${firma(secreto, texto)}`;
}

export type VerificacionToken = { ok: true } | { ok: false; reason: string };

/**
 * ¿Este token autoriza escribir el brief de esta persona y este día?
 *
 * El motivo del fallo se devuelve por separado del `ok` para que la ruta pueda
 * registrarlo, pero NO se le enseña al agente con detalle: distinguir «firma
 * inválida» de «caducado» le diría a quien está probando llaves cuál de las dos
 * mitades acertó.
 */
export function verificarToken(secreto: string, token: string, sujeto: Sujeto, ahora: number = Date.now()): VerificacionToken {
  const partes = token.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { ok: false, reason: "El token no tiene la forma esperada." };

  let texto: string;
  try {
    texto = Buffer.from(partes[0], "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "El token no se pudo decodificar." };
  }

  const esperada = Buffer.from(firma(secreto, texto), "utf8");
  const recibida = Buffer.from(partes[1], "utf8");
  // La comparación de longitud va primero porque `timingSafeEqual` LANZA si no
  // coinciden, en vez de devolver falso.
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    return { ok: false, reason: "La firma del token no es válida." };
  }

  const [userId, localDate, emitido] = texto.split("|");
  if (userId !== sujeto.userId) return { ok: false, reason: "El token se emitió para otra persona." };
  if (localDate !== sujeto.localDate) return { ok: false, reason: "El token se emitió para otro día." };

  const emitidoEn = Number(emitido);
  if (!Number.isFinite(emitidoEn)) return { ok: false, reason: "El token no lleva una fecha de emisión legible." };
  // Se rechaza también el token del futuro: un reloj desincronizado entre el
  // agente y la app produciría tokens que nunca caducan.
  if (emitidoEn > ahora + 60_000) return { ok: false, reason: "El token viene del futuro." };
  if (ahora - emitidoEn > VIGENCIA_MS) return { ok: false, reason: "El token caducó." };

  return { ok: true };
}
