// src/lib/domain/push/encrypt.ts
//
// CIFRADO DEL CUERPO DE UNA NOTIFICACIÓN PUSH (RFC 8291 sobre RFC 8188).
//
// POR QUÉ ESTO ESTÁ ESCRITO A MANO Y NO SE INSTALÓ `web-push`
// Porque no hacía falta: `crypto.subtle` trae ECDH P-256, HKDF y AES-GCM de
// fábrica, que es exactamente todo lo que pide el RFC. Añadir un paquete (y
// sus transitivas) para orquestar tres primitivas que ya están en la
// plataforma habría roto D-008 sin ganar nada — el mismo criterio por el que
// `src/lib/email/send.ts` le habla a Resend por `fetch` en vez de con su SDK.
//
// POR QUÉ SE CIFRA Y NO SE MANDA UN AVISO VACÍO
// La alternativa era empujar un push sin contenido y que el service worker
// fuera a buscar el texto. Se descartó: `userVisibleOnly` obliga a mostrar una
// notificación SÍ O SÍ, así que si esa segunda petición falla —sesión
// caducada, sin cobertura— el navegador enseña «Este sitio se ha actualizado
// en segundo plano» y, si se repite, REVOCA la suscripción. El modo de fallo
// no era «no suena», era «suena con un texto que no escribimos y a la tercera
// dejas de recibir avisos».
//
// Cifrar además cumple lo que aquel diseño prometía: el contenido va cifrado
// de extremo a extremo, así que ni FCM ni APNs pueden leerlo (§ Privacidad del
// README). Solo ven el tamaño y el momento.
//
// LA GARANTÍA CRIPTOGRÁFICA DEPENDE DE QUE EL SALT Y LA CLAVE EFÍMERA SEAN
// NUEVOS EN CADA ENVÍO. De ahí derivan la clave y el nonce de AES-GCM:
// reutilizar el par (clave, nonce) es la forma clásica de romper GCM, así que
// `options` existe SOLO para que la prueba pueda reproducir el vector del RFC.
// Nadie más debe pasarlo.

import { concatBytes, fromBase64Url } from "./base64url.ts";

/**
 * Tamaño de registro anunciado en la cabecera. 4096 es el valor del ejemplo
 * del RFC y sobra: un push útil son unos cientos de bytes y los servicios
 * rechazan cuerpos de más de ~4 KB, así que nunca hay un segundo registro.
 */
export const RECORD_SIZE = 4096;

/** Longitud de la clave pública P-256 sin comprimir: 0x04 ‖ X(32) ‖ Y(32). */
const PUBLIC_KEY_BYTES = 65;

export interface SubscriptionKeys {
  /** `keys.p256dh` de la suscripción: la clave pública del navegador. */
  p256dh: string;
  /** `keys.auth` de la suscripción: 16 octetos de secreto compartido. */
  auth: string;
}

export interface EncryptOptions {
  /** SOLO para pruebas: fija el salt en vez de sortearlo. */
  salt?: Uint8Array;
  /** SOLO para pruebas: fija el par efímero en vez de generarlo. */
  ephemeral?: CryptoKeyPair;
}

const enc = new TextEncoder();

/** HKDF-Extract (RFC 5869): un HMAC-SHA256 donde el salt hace de clave. */
async function extract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    salt as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, ikm as unknown as ArrayBuffer));
}

/**
 * HKDF-Expand (RFC 5869) limitado a un bloque.
 *
 * Las tres derivaciones de este archivo piden 32, 16 y 12 octetos, todas por
 * debajo de los 32 que da SHA-256, así que la primera iteración basta. Se
 * comprueba en vez de asumirlo: si algún día alguien pide más, es mejor un
 * error claro que una clave silenciosamente truncada.
 */
async function expand(prk: Uint8Array, info: Uint8Array, longitud: number): Promise<Uint8Array> {
  if (longitud > 32) throw new Error("expand: más de un bloque HKDF no está implementado");
  const key = await crypto.subtle.importKey(
    "raw",
    prk as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bloque = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, concatBytes(info, Uint8Array.of(1)) as unknown as ArrayBuffer)
  );
  return bloque.slice(0, longitud);
}

/**
 * Cifra `plaintext` para una suscripción concreta y devuelve el cuerpo entero
 * que se manda en el POST: cabecera de 86 octetos + registro AES-GCM.
 *
 * El resultado va tal cual como body, con `Content-Encoding: aes128gcm`.
 */
export async function encryptPushPayload(
  plaintext: string,
  keys: SubscriptionKeys,
  options: EncryptOptions = {}
): Promise<Uint8Array> {
  const uaPublic = fromBase64Url(keys.p256dh);
  const authSecret = fromBase64Url(keys.auth);

  if (uaPublic.length !== PUBLIC_KEY_BYTES) {
    throw new Error(`p256dh debe medir ${PUBLIC_KEY_BYTES} octetos y mide ${uaPublic.length}`);
  }

  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));

  // Par efímero: uno por mensaje. Es lo que hace que dos envíos idénticos no
  // compartan clave de contenido.
  const ephemeral =
    options.ephemeral ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits"
    ])) as CryptoKeyPair);

  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as unknown as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, ephemeral.privateKey, 256)
  );

  // RFC 8291 §3.3: el secreto de autenticación mezcla el ECDH con la identidad
  // de AMBAS claves públicas. Que el `key_info` lleve las dos en este orden
  // (primero la del navegador) es justo lo que ata el mensaje a esta
  // suscripción y no a otra.
  const prkKey = await extract(authSecret, ecdhSecret);
  const keyInfo = concatBytes(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await expand(prkKey, keyInfo, 32);

  // A partir de aquí es RFC 8188 puro: el content-encoding genérico.
  const prk = await extract(salt, ikm);
  const cek = await expand(prk, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await expand(prk, enc.encode("Content-Encoding: nonce\0"), 12);

  // 0x02 es el delimitador de relleno del ÚLTIMO registro (0x01 sería «hay
  // más»). Como siempre mandamos uno solo, siempre es 0x02.
  const padded = concatBytes(enc.encode(plaintext), Uint8Array.of(0x02));

  const aesKey = await crypto.subtle.importKey("raw", cek as unknown as ArrayBuffer, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as unknown as ArrayBuffer },
      aesKey,
      padded as unknown as ArrayBuffer
    )
  );

  // Cabecera: salt(16) ‖ rs(4, big-endian) ‖ idlen(1) ‖ as_public(65) = 86.
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE);

  return concatBytes(salt, rs, Uint8Array.of(asPublic.length), asPublic, ciphertext);
}
