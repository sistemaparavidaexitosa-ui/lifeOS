#!/usr/bin/env node
// Genera el par de claves VAPID de Web Push. Se ejecuta UNA VEZ por entorno:
//
//   node scripts/generate-vapid.mjs
//
// VAPID (RFC 8292) es cómo el servicio de push —FCM en Android, APNs en
// iPhone— sabe que quien empuja una notificación a tu teléfono somos
// nosotros. Firmamos cada envío con la privada; el navegador registró la
// pública al suscribirse, y el servicio compara.
//
// SIN DEPENDENCIAS: `crypto.webcrypto` de Node hace P-256 de fábrica, igual
// que el navegador. Es el mismo criterio de D-008 que llevó a hablarle a
// Resend por `fetch` en vez de instalar su SDK.
//
// La privada sale como JWK COMPLETO en una sola variable a propósito. Ver el
// comentario de `requireVapidKeys()` en src/config/env.ts: reconstruir una
// clave EC desde `d`, `x` e `y` sueltos es la forma clásica de acabar con una
// firma inválida y un 401 que no explica nada.

import { webcrypto } from "node:crypto";

const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"]
);

const privateJwk = await webcrypto.subtle.exportKey("jwk", privateKey);

// La clave pública viaja al navegador en formato "raw": 65 bytes que empiezan
// por 0x04 (punto sin comprimir), codificados en base64url. Es exactamente lo
// que `pushManager.subscribe({ applicationServerKey })` espera.
const raw = new Uint8Array(await webcrypto.subtle.exportKey("raw", publicKey));
const publicB64 = Buffer.from(raw).toString("base64url");

// `key_ops` y `ext` estorban al reimportar en algunos runtimes: se quitan aquí
// para que la variable de entorno sea justo lo que hace falta y nada más.
delete privateJwk.key_ops;
delete privateJwk.ext;

// Antes de entregar nada, se comprueba que las dos mitades son pareja de
// verdad: se firma con la privada REIMPORTADA desde el JWK que vamos a
// imprimir y se verifica con la pública en crudo que vamos a imprimir.
//
// No es ceremonia. El modo de fallo que evita es el que describe
// `requireVapidKeys()` en src/config/env.ts: un JWK que reimporta mal produce
// una firma inválida, y el servicio de push responde a eso con un 401 que no
// explica nada. Mejor enterarse aquí que contra APNs.
const privadaReimportada = await webcrypto.subtle.importKey(
  "jwk",
  privateJwk,
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"]
);
const publicaEnCrudo = await webcrypto.subtle.importKey(
  "raw",
  raw,
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["verify"]
);

const mensaje = new TextEncoder().encode("comprobacion de pareja");
const firma = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privadaReimportada, mensaje);
const esPareja = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicaEnCrudo, firma, mensaje);

if (raw[0] !== 0x04 || raw.length !== 65) {
  throw new Error(`La clave pública no es un punto sin comprimir de 65 octetos (${raw.length}, primer byte ${raw[0]}).`);
}
if (new Uint8Array(firma).length !== 64) {
  throw new Error("La firma no mide 64 octetos: no es el formato r‖s que espera JOSE.");
}
if (!esPareja) {
  throw new Error("La privada y la pública NO son pareja. No uses estas claves.");
}

// Los dos destinos piden el MISMO valor con distinta envoltura, y mezclarlos
// es un error real que ya ocurrió: en un archivo .env el JWK va entre comillas
// simples (si no, el `#` o los espacios podrían cortarlo), pero el formulario
// de Vercel guarda lo que pegues TAL CUAL — comillas incluidas—, y entonces
// JSON.parse revienta. Por eso se imprimen por separado en vez de una lista
// que sirva "para los dos".
console.log(`
✓ Comprobado: la privada reimportada firma y la pública la verifica (65 octetos, firma de 64).

━━ Para .env.local (aquí el JWK VA entre comillas) ━━

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicB64}
VAPID_PRIVATE_JWK='${JSON.stringify(privateJwk)}'
VAPID_SUBJECT=mailto:tu-correo@ejemplo.com

━━ Para Vercel — Settings › Environment Variables ━━
   Un valor por campo, SIN comillas. El JWK empieza por { y termina en }.

NEXT_PUBLIC_VAPID_PUBLIC_KEY
${publicB64}

VAPID_PRIVATE_JWK
${JSON.stringify(privateJwk)}

VAPID_SUBJECT
mailto:tu-correo@ejemplo.com

⚠️  VAPID_PRIVATE_JWK es un SECRETO: nunca con prefijo NEXT_PUBLIC_, nunca en git.
⚠️  Si algún día lo cambias, TODAS las suscripciones existentes dejan de valer y
    cada dispositivo tiene que volver a activar las notificaciones.
`);
