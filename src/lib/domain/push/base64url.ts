// src/lib/domain/push/base64url.ts
// base64url (RFC 4648 §5) — lógica pura, sin dependencias.
//
// Todo el material de Web Push viaja en este formato: la clave pública de la
// suscripción, el secreto de autenticación, la clave VAPID y las tres partes
// del JWT. Es base64 normal con `+/` cambiados por `-_` y SIN el relleno `=`.
//
// Se usan `atob`/`btoa` y no `Buffer` a propósito: este módulo es dominio puro
// y tiene que dar el mismo resultado en Node, en el runtime de Vercel y en el
// service worker, donde `Buffer` no existe.

export function toBase64Url(bytes: Uint8Array): string {
  let binario = "";
  // De uno en uno y no con `String.fromCharCode(...bytes)`: el spread revienta
  // la pila con payloads grandes (RangeError a partir de ~100 KB).
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(texto: string): Uint8Array {
  const base64 = texto.replace(/-/g, "+").replace(/_/g, "/");
  // `atob` exige que la longitud sea múltiplo de 4; base64url llega sin
  // relleno, así que se repone aquí.
  const relleno = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binario = atob(base64 + relleno);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Une varios tramos de bytes. Se repite tanto en este dominio que merece nombre. */
export function concatBytes(...tramos: readonly Uint8Array[]): Uint8Array {
  const total = tramos.reduce((n, t) => n + t.length, 0);
  const salida = new Uint8Array(total);
  let offset = 0;
  for (const t of tramos) {
    salida.set(t, offset);
    offset += t.length;
  }
  return salida;
}
