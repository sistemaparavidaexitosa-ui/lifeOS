// src/lib/domain/push/vapid.ts
//
// FIRMA VAPID (RFC 8292): cómo el servicio de push sabe que quien empuja
// somos nosotros.
//
// El navegador se suscribió anunciando nuestra clave pública. A partir de ahí,
// cada envío lleva un JWT firmado con la privada y, al lado, esa misma pública
// en claro. FCM y APNs comprueban que casan. Sin esto, cualquiera que
// descubriera el endpoint de alguien podría hacerle sonar el teléfono.
//
// Lógica pura: recibe las credenciales y devuelve una cadena. Ni red, ni
// entorno, ni Supabase — quien lee las variables es `requireVapidKeys()`.

import { toBase64Url } from "./base64url.ts";

export interface VapidCredentials {
  /** JWK completo de la clave privada P-256 (ver `requireVapidKeys`). */
  privateJwk: JsonWebKey;
  /** La mitad pública, en crudo base64url: la que anunciamos en `k=`. */
  publicKey: string;
  /** `mailto:` o `https:`. Apple rechaza cualquier otra cosa. */
  subject: string;
}

/**
 * Doce horas. El RFC permite hasta 24 y Apple rechaza por encima de eso, así
 * que la mitad deja margen de sobra para un reloj desajustado en cualquiera de
 * los dos extremos sin acercarse al límite.
 */
const VIGENCIA_SEGUNDOS = 12 * 60 * 60;

/**
 * Construye el valor de la cabecera `Authorization` de un envío push.
 *
 * `nowMs` entra como parámetro y no se lee de `Date.now()` dentro para que la
 * prueba pueda fijar el instante — el mismo criterio que `todayLocal` en el
 * resto del proyecto (D-016/D-018).
 */
export async function vapidAuthorization(
  endpoint: string,
  credentials: VapidCredentials,
  nowMs: number = Date.now()
): Promise<string> {
  let audience: string;
  try {
    // El `aud` es el ORIGEN, no el endpoint entero: la URL completa lleva
    // dentro el token de la suscripción, y meterlo en un JWT que atraviesa
    // intermediarios sería filtrarlo. El servicio además lo exige así.
    audience = new URL(endpoint).origin;
  } catch {
    throw new Error(`El endpoint de la suscripción no es una URL válida: ${endpoint.slice(0, 80)}`);
  }

  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(nowMs / 1000) + VIGENCIA_SEGUNDOS,
    sub: credentials.subject
  };

  const enc = new TextEncoder();
  const firmado = `${toBase64Url(enc.encode(JSON.stringify(header)))}.${toBase64Url(
    enc.encode(JSON.stringify(payload))
  )}`;

  const key = await crypto.subtle.importKey(
    "jwk",
    credentials.privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // `crypto.subtle` devuelve la firma como r‖s en crudo (64 octetos), que es
  // EXACTAMENTE el formato que pide JOSE. Es una de las pocas veces en que la
  // Web Crypto API ahorra trabajo: OpenSSL entrega DER y habría que
  // convertirla, y una firma DER en un JWT se traduce en un 401 mudo.
  const firma = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(firmado) as unknown as ArrayBuffer)
  );

  const jwt = `${firmado}.${toBase64Url(firma)}`;
  return `vapid t=${jwt}, k=${credentials.publicKey}`;
}
