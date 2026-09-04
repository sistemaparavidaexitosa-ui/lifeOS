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

console.log(`
Pega esto en .env.local (y en las variables de Vercel):

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicB64}
VAPID_PRIVATE_JWK='${JSON.stringify(privateJwk)}'
VAPID_SUBJECT=mailto:tu-correo@ejemplo.com

⚠️  VAPID_PRIVATE_JWK es un SECRETO: nunca con prefijo NEXT_PUBLIC_, nunca en git.
⚠️  Si algún día lo cambias, TODAS las suscripciones existentes dejan de valer y
    cada dispositivo tiene que volver a activar las notificaciones.
`);
