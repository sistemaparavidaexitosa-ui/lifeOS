// tests/domain/push-encrypt.test.ts
//
// El cifrado de Web Push (RFC 8291) está escrito a mano sobre `crypto.subtle`,
// así que esta prueba NO es un extra: es lo único que separa "criptografía
// propia" de "adivinar". Un error de un byte en el orden de los `info` produce
// un mensaje que FCM y APNs rechazan con un 400 sin explicación, y depurar eso
// contra un servicio remoto cuesta un día entero.
//
// El vector es el del propio RFC 8291 §5 y su Apéndice A, con la clave efímera
// y el salt INYECTADOS: de otro modo cada ejecución daría un resultado distinto
// y no habría nada que comparar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptPushPayload, RECORD_SIZE } from "../../src/lib/domain/push/encrypt.ts";
import { fromBase64Url, toBase64Url } from "../../src/lib/domain/push/base64url.ts";

// ─── Vector de RFC 8291 §5 / Apéndice A ──────────────────────────────────────
const PLAINTEXT = "When I grow up, I want to be a watermelon";
const AUTH_SECRET = "BTBZMqHH6r4Tts7J_aSIgg";
const UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const UA_PRIVATE = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94";
const AS_PUBLIC = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const AS_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
const SALT = "DGv6ra1nlYgDCS1FRnbzlw";

/** El mensaje completo del §5, con los saltos de línea de presentación quitados. */
const EXPECTED =
  "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
  "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
  "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

/** La cabecera de 86 octetos que describe el Apéndice A. */
const EXPECTED_HEADER =
  "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
  "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";

/**
 * Reconstruye un par EC a partir de la privada y la pública crudas del RFC.
 * Vive aquí y no en el módulo porque en producción la clave efímera SIEMPRE se
 * genera al vuelo: poder importar una fija solo tiene sentido para esta prueba.
 */
async function importarParFijo(privateD: string, publicRaw: string): Promise<CryptoKeyPair> {
  const raw = fromBase64Url(publicRaw); // 0x04 || X(32) || Y(32)
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: privateD,
    x: toBase64Url(raw.slice(1, 33)),
    y: toBase64Url(raw.slice(33, 65))
  };
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, [
    "deriveBits"
  ]);
  // La pública se importa aparte: `deriveBits` no la necesita, pero el módulo
  // exporta la suya en crudo y aquí queremos entregar exactamente la del RFC.
  const publicKey = await crypto.subtle.importKey(
    "raw",
    fromBase64Url(publicRaw) as unknown as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
  return { privateKey, publicKey };
}

test("encryptPushPayload reproduce EXACTAMENTE el mensaje del RFC 8291 §5", async () => {
  const ephemeral = await importarParFijo(AS_PRIVATE, AS_PUBLIC);

  const body = await encryptPushPayload(PLAINTEXT, { p256dh: UA_PUBLIC, auth: AUTH_SECRET }, {
    salt: fromBase64Url(SALT),
    ephemeral
  });

  assert.equal(toBase64Url(body), EXPECTED);
});

test("la cabecera son los 86 octetos que describe el Apéndice A", async () => {
  const ephemeral = await importarParFijo(AS_PRIVATE, AS_PUBLIC);
  const body = await encryptPushPayload(PLAINTEXT, { p256dh: UA_PUBLIC, auth: AUTH_SECRET }, {
    salt: fromBase64Url(SALT),
    ephemeral
  });

  const header = body.slice(0, 86);
  assert.equal(header.length, 86);
  assert.equal(toBase64Url(header), EXPECTED_HEADER);

  // salt(16) ‖ rs(4, big-endian) ‖ idlen(1) ‖ as_public(65)
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  assert.equal(view.getUint32(16), RECORD_SIZE);
  assert.equal(header[20], 65);
});

test("sin clave efímera inyectada, dos cifrados del mismo texto salen distintos", async () => {
  const keys = { p256dh: UA_PUBLIC, auth: AUTH_SECRET };
  const a = await encryptPushPayload(PLAINTEXT, keys);
  const b = await encryptPushPayload(PLAINTEXT, keys);

  // Salt y clave efímera aleatorios por envío: si esto empatara, se estaría
  // reutilizando el par (salt, nonce) con la misma clave, que es la forma
  // clásica de romper AES-GCM.
  assert.notEqual(toBase64Url(a), toBase64Url(b));
  assert.equal(a.length, b.length);
});

test("el receptor puede descifrarlo: ida y vuelta completa con la clave del RFC", async () => {
  // Este es el que comprueba que el mensaje SIRVE, no solo que coincide con un
  // vector. Descifra como lo haría el navegador, derivando por su lado.
  const body = await encryptPushPayload(PLAINTEXT, { p256dh: UA_PUBLIC, auth: AUTH_SECRET });

  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);

  const uaRaw = fromBase64Url(UA_PUBLIC);
  const uaPrivate = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: UA_PRIVATE,
      x: toBase64Url(uaRaw.slice(1, 33)),
      y: toBase64Url(uaRaw.slice(33, 65))
    },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );
  const asPublicKey = await crypto.subtle.importKey(
    "raw",
    asPublic as unknown as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asPublicKey }, uaPrivate, 256)
  );

  const hmac = async (key: Uint8Array, data: Uint8Array) => {
    const k = await crypto.subtle.importKey(
      "raw",
      key as unknown as ArrayBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as unknown as ArrayBuffer));
  };
  const cat = (...xs: Uint8Array[]) => {
    const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of xs) {
      out.set(x, o);
      o += x.length;
    }
    return out;
  };
  const enc = new TextEncoder();

  const prkKey = await hmac(fromBase64Url(AUTH_SECRET), ecdh);
  const keyInfo = cat(enc.encode("WebPush: info\0"), uaRaw, asPublic);
  const ikm = (await hmac(prkKey, cat(keyInfo, Uint8Array.of(1)))).slice(0, 32);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode("Content-Encoding: aes128gcm\0"), Uint8Array.of(1)))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode("Content-Encoding: nonce\0"), Uint8Array.of(1)))).slice(0, 12);

  const aes = await crypto.subtle.importKey("raw", cek as unknown as ArrayBuffer, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce as unknown as ArrayBuffer },
      aes,
      ciphertext as unknown as ArrayBuffer
    )
  );

  assert.equal(plain[plain.length - 1], 0x02, "falta el octeto delimitador de relleno");
  assert.equal(new TextDecoder().decode(plain.slice(0, -1)), PLAINTEXT);
});
