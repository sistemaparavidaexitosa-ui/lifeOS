// F4 🔴: Prohibido `schema.parse()` a nivel de módulo — rompe `next build`
// ("collect page data") con un ZodError si falta una env var en tiempo de
// build. Usamos `safeParse` + defaults para `NEXT_PUBLIC_*` (build-safe) y
// validación LAZY (en el primer uso, en runtime) para secretos de servidor.
//
// F11 🔴: cada feature valida SOLO sus propios secretos. Este módulo NO debe
// convertirse en un validador monolítico que exija Stripe/OTP/Resend aunque
// la acción invocada no los use.

import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("http://localhost:54321"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(""),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Life OS"),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.string().default("es-MX"),
  NEXT_PUBLIC_DEFAULT_CURRENCY: z.string().default("MXN"),
  // Clave PÚBLICA VAPID. Es pública de verdad: el navegador la necesita en
  // `pushManager.subscribe()` para que el servicio de push (FCM/APNs) sepa
  // que los envíos firmados con la privada son nuestros. Con `default("")`
  // la app arranca sin ella y `PushSetup` simplemente no ofrece activar.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().default("")
});

// safeParse: NUNCA lanza. Si faltan variables en build time, se usan los
// defaults y el build no se rompe (F4). La app mostrará advertencias en
// runtime si `NEXT_PUBLIC_SUPABASE_ANON_KEY` está vacío al conectar.
const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
  NEXT_PUBLIC_DEFAULT_CURRENCY: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
});

export const publicEnv = parsedPublic.success
  ? parsedPublic.data
  : publicSchema.parse({}); // aplica solo defaults, jamás lanza en build

/**
 * Validación LAZY del secreto de service_role. Se llama únicamente desde
 * `src/lib/supabase/admin.ts`, que a su vez solo se importa en Route
 * Handlers/Server Actions que de verdad necesitan saltar RLS. Si falta,
 * lanza en RUNTIME (primer uso), nunca en build time.
 */
export function requireServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY no está definida. Esta acción requiere el cliente admin (service_role) — ver /docs/DEPLOY.md."
    );
  }
  return key;
}

/**
 * F11: el ÚNICO secreto de IA que queda. Lo exigen las tres features que
 * llaman al modelo —recomendaciones, plan de proyecto y el chat— y nadie más:
 * ninguna página, ninguna otra acción. Si falta, esas tres dicen que no están
 * configuradas y el resto de la app no se entera.
 *
 * Fueron dos (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) mientras convivieron dos
 * proveedores. Ahora todo sale por `src/lib/ai/gemini-provider.ts`.
 */
export function requireGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY no está definida. Solo se requiere para las funciones de IA (recomendaciones, plan de proyecto y chat) — ver /docs/DEPLOY.md."
    );
  }
  return key;
}

/**
 * F11: la llave de FoodData Central (USDA), y es OPCIONAL de verdad.
 *
 * Solo la exige el buscador de alimentos genéricos. Sin ella la búsqueda cae
 * en Open Food Facts —que no pide llave— y el módulo de nutrición sigue
 * funcionando entero: `searchUsda` envuelve esto en un `try/catch` y trata la
 * ausencia como «este proveedor no pudo contestar», que es un caso que ya
 * sabía manejar.
 *
 * NUNCA usar `DEMO_KEY` como valor por defecto: son 30 peticiones por hora
 * compartidas con todo internet, así que fallaría de forma intermitente e
 * inexplicable en vez de fallar claro.
 */
export function requireUsdaApiKey(): string {
  const key = process.env.USDA_API_KEY;
  if (!key) {
    throw new Error(
      "USDA_API_KEY no está definida. Solo la exige el buscador de alimentos genéricos (FoodData Central); sin ella se busca en Open Food Facts — ver /docs/DEPLOY.md."
    );
  }
  return key;
}

/**
 * F11: ejemplo de validación desacoplada por feature. Ninguna acción que NO
 * use el proveedor de email para invitaciones debe exigir esta variable.
 * Si en el futuro se activa el envío de invitaciones por correo (FR-WSP-003),
 * esta función se invoca SOLO desde esa Server Action específica.
 */
export function requireResendApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY no está definida. Solo se requiere para enviar invitaciones por correo (FR-WSP-003).");
  }
  return key;
}

/**
 * F11: las llaves de Web Push, exigidas SOLO por `src/lib/push/send.ts`.
 *
 * La privada se guarda como un JWK COMPLETO en una sola variable, no como `d`
 * y las coordenadas por separado. Reconstruir una clave EC desde trozos
 * sueltos es la fuente clásica de bugs de este terreno: basta con que `x` o
 * `y` lleguen con un byte de padding de más para que `importKey` acepte la
 * clave y la firma salga inválida — y el servicio de push responde a eso con
 * un 401 que no explica nada.
 *
 * Sin estas variables la app funciona entera y las notificaciones
 * simplemente no salen: `sendPush` nunca lanza, devuelve `{sent:false}`.
 */
export function requireVapidKeys(): { privateJwk: JsonWebKey; publicKey: string; subject: string } {
  const raw = process.env.VAPID_PRIVATE_JWK;
  if (!raw) {
    throw new Error(
      "VAPID_PRIVATE_JWK no está definida. Solo la exigen las notificaciones push — genera el par con `node scripts/generate-vapid.mjs` (ver /docs/DEPLOY.md)."
    );
  }

  let privateJwk: JsonWebKey;
  try {
    privateJwk = JSON.parse(raw) as JsonWebKey;
  } catch {
    throw new Error("VAPID_PRIVATE_JWK no es un JSON válido. Debe ser el JWK completo que imprime `node scripts/generate-vapid.mjs`.");
  }

  const publicKey = publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY no está definida. Es la mitad pública del par de VAPID_PRIVATE_JWK.");
  }

  /**
   * `sub` identifica a quien envía, y Apple RECHAZA el push si no es un
   * `mailto:` o un `https:` válido. El default apunta a la propia app porque
   * una URL siempre existe; un correo real es mejor si lo hay.
   */
  const subject = process.env.VAPID_SUBJECT || publicEnv.NEXT_PUBLIC_APP_URL;

  return { privateJwk, publicKey, subject };
}

/**
 * F11: el secreto que separa a pg_cron de cualquiera que descubra la URL del
 * despachador. Esa ruta corre sin sesión (la llama la base de datos, no un
 * navegador), así que es lo ÚNICO que la protege.
 */
export function requirePushDispatchSecret(): string {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret) {
    throw new Error(
      "PUSH_DISPATCH_SECRET no está definida. La exige /api/push/dispatch, que corre sin sesión porque lo invoca pg_cron — ver /docs/DEPLOY.md."
    );
  }
  return secret;
}
