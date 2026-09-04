// tests/domain/push-vapid.test.ts
//
// VAPID (RFC 8292) es la firma con la que el servicio de push —FCM o APNs—
// comprueba que quien empuja somos nosotros. Aquí no hay vector fijo posible:
// ECDSA es aleatorio y cada firma sale distinta. Así que lo que se prueba es
// todo lo demás, que es justo donde están los errores caros:
//
//   - el `aud` tiene que ser el ORIGEN del endpoint, no el endpoint entero;
//   - el `exp` no puede pasar de 24 h o Apple rechaza el envío;
//   - la firma tiene que verificar contra la clave pública que anunciamos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { vapidAuthorization } from "../../src/lib/domain/push/vapid.ts";
import { fromBase64Url, toBase64Url } from "../../src/lib/domain/push/base64url.ts";

const SUBJECT = "mailto:avisos@ejemplo.com";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123?token=xyz";

/**
 * El par se genera al vuelo, no va escrito aquí.
 *
 * Dos razones. La primera es que no hace falta: ECDSA firma distinto cada vez,
 * así que un par fijo no haría determinista nada de lo que se comprueba abajo.
 * La segunda es que una clave privada escrita en el repositorio es una clave
 * privada en el repositorio, por desechable que sea — y la siguiente persona
 * que la vea no tendrá forma de saber si alguna vez se usó de verdad.
 */
const CREDS = await (async () => {
  const par = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify"
  ])) as CryptoKeyPair;

  const privateJwk = await crypto.subtle.exportKey("jwk", par.privateKey);
  delete privateJwk.key_ops;
  delete privateJwk.ext;

  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  return { privateJwk, publicKey: toBase64Url(raw), subject: SUBJECT };
})();

const PUBLIC_KEY = CREDS.publicKey;

function partes(header: string) {
  const t = /t=([^,\s]+)/.exec(header)?.[1] ?? "";
  const k = /k=([^,\s]+)/.exec(header)?.[1] ?? "";
  const [h, p, s] = t.split(".");
  return {
    k,
    firmado: `${h}.${p}`,
    header: JSON.parse(new TextDecoder().decode(fromBase64Url(h))),
    payload: JSON.parse(new TextDecoder().decode(fromBase64Url(p))),
    firma: fromBase64Url(s)
  };
}

test("el `aud` es el origen del endpoint, nunca la URL completa", async () => {
  const { payload } = partes(await vapidAuthorization(ENDPOINT, CREDS));
  // Mandar el endpoint entero (con su token secreto dentro) sería filtrarlo en
  // un JWT que atraviesa intermediarios, y además el servicio lo rechaza.
  assert.equal(payload.aud, "https://fcm.googleapis.com");
});

test("el `exp` cae dentro de las próximas 24 h — Apple rechaza más", async () => {
  const ahora = 1_800_000_000_000;
  const { payload } = partes(await vapidAuthorization(ENDPOINT, CREDS, ahora));
  const segundos = Math.floor(ahora / 1000);
  assert.ok(payload.exp > segundos, "el token ya nacería caducado");
  assert.ok(payload.exp <= segundos + 24 * 60 * 60, "más de 24 h: APNs lo rechaza");
});

test("cabecera JWT correcta y `sub` intacto", async () => {
  const { header, payload, k } = partes(await vapidAuthorization(ENDPOINT, CREDS));
  assert.equal(header.typ, "JWT");
  assert.equal(header.alg, "ES256");
  assert.equal(payload.sub, SUBJECT);
  assert.equal(k, PUBLIC_KEY);
});

test("la firma verifica contra la clave pública anunciada en `k`", async () => {
  const { firmado, firma, k } = partes(await vapidAuthorization(ENDPOINT, CREDS));

  // Se verifica con la clave que va en `k`, que es exactamente lo que hará el
  // servicio de push. Si `k` y la privada no fueran pareja, esto falla.
  const clave = await crypto.subtle.importKey(
    "raw",
    fromBase64Url(k) as unknown as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    clave,
    firma as unknown as ArrayBuffer,
    new TextEncoder().encode(firmado) as unknown as ArrayBuffer
  );
  assert.ok(ok, "la firma no verifica");

  // 64 octetos crudos (r‖s), que es el formato JOSE. Si `subtle` devolviera
  // DER —como hace OpenSSL— medirían ~70 y el servicio daría 401.
  assert.equal(firma.length, 64);
});

test("un endpoint que no es una URL falla claro, no produce un token inválido", async () => {
  await assert.rejects(() => vapidAuthorization("no-soy-una-url", CREDS), /endpoint/i);
});
