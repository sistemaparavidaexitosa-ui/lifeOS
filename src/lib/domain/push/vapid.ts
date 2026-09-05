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

import { fromBase64Url, toBase64Url } from "./base64url.ts";

/**
 * Reconstruye el JWK de la clave privada a partir de su componente `d` y de la
 * clave pública que ya tenemos configurada.
 *
 * POR QUÉ EXISTE
 * La alternativa era guardar el JWK entero en la variable de entorno, y eso
 * falló dos veces en la práctica: el objeto lleva llaves, comas y comillas, y
 * al pegarlo en el importador masivo de variables de Vercel su parser quita las
 * comillas dobles del valor —incluidas las de DENTRO— dejando `{kty:EC,...}`,
 * que ya no es JSON. Un secreto que hay que transportar por un formulario web
 * no puede depender de que sobreviva su puntuación.
 *
 * `d` en base64url son 43 caracteres sin un solo signo: no hay parser que se lo
 * coma. Es además la forma que usa todo el ecosistema de Web Push.
 *
 * LA OBJECIÓN A ESTO ERA REAL Y SIGUE ATENDIDA: reconstruir una clave EC desde
 * trozos sueltos es la fuente clásica de bugs, porque `x` e `y` mal alineados
 * producen una firma inválida y un 401 mudo. Aquí no hay trozos sueltos —
 * `x` e `y` salen del ÚNICO sitio donde ya viven, la clave pública, así que no
 * pueden desincronizarse entre sí. Lo único que puede no casar es `d` con esa
 * pública, que es exactamente lo que comprueba `generate-vapid.mjs` al crearlas.
 */
export function jwkFromPrivateKey(privateKeyBase64Url: string, publicKeyBase64Url: string): JsonWebKey {
  const raw = fromBase64Url(publicKeyBase64Url);

  // 0x04 ‖ X(32) ‖ Y(32): el formato «sin comprimir» de X9.62, que es el que
  // anuncia el navegador al suscribirse.
  if (raw.length !== 65 || raw[0] !== 0x04) {
    throw new Error(
      `La clave pública VAPID debe ser un punto sin comprimir de 65 octetos que empiece por 0x04 (recibidos ${raw.length}).`
    );
  }

  return {
    kty: "EC",
    crv: "P-256",
    d: privateKeyBase64Url.trim(),
    x: toBase64Url(raw.slice(1, 33)),
    y: toBase64Url(raw.slice(33, 65))
  };
}

/**
 * ¿La privada y la pública configuradas son realmente pareja?
 *
 * Firma con una y verifica con la otra. No hay atajo aritmético: WebCrypto no
 * expone la multiplicación escalar que haría falta para derivar el punto
 * público desde `d`, así que la única comprobación posible es usarlas.
 *
 * POR QUÉ MERECE LA PENA HACERLO ANTES DE ENVIAR
 * FCM y APNs contestan 401/403 a DOS problemas distintos que se arreglan de
 * forma distinta: que las llaves no casen entre sí (se corrigen las variables)
 * o que el dispositivo se suscribiera con una clave anterior (se desactiva y se
 * vuelve a activar allí). El código de estado no los separa; esto sí.
 *
 * Ojo con la trampa que hace falsamente tranquilizador un JWK: si `x` e `y` se
 * reconstruyen desde la pública (`jwkFromPrivateKey`), SIEMPRE coincidirán con
 * ella. Lo que puede no casar es `d`, y eso solo se ve firmando.
 */
export async function isVapidPair(privateJwk: JsonWebKey, publicKeyBase64Url: string): Promise<boolean> {
  try {
    const privada = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
      "sign"
    ]);
    const publica = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(publicKeyBase64Url) as unknown as ArrayBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    const muestra = new TextEncoder().encode("vapid-pair-check");
    const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privada, muestra);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publica,
      firma,
      muestra as unknown as ArrayBuffer
    );
  } catch {
    // Una clave que ni siquiera importa tampoco es pareja de nada.
    return false;
  }
}

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
