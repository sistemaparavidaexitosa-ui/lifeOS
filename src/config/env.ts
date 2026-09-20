// F4 🔴: Prohibido `schema.parse()` a nivel de módulo — rompe `next build`
// ("collect page data") con un ZodError si falta una env var en tiempo de
// build. Usamos `safeParse` + defaults para `NEXT_PUBLIC_*` (build-safe) y
// validación LAZY (en el primer uso, en runtime) para secretos de servidor.
//
// F11 🔴: cada feature valida SOLO sus propios secretos. Este módulo NO debe
// convertirse en un validador monolítico que exija Stripe/OTP/Resend aunque
// la acción invocada no los use.

import { z } from "zod";
import { jwkFromPrivateKey, normalizeVapidSubject } from "@/lib/domain/push/vapid.ts";

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

  const publicKey = publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY no está definida. Es la mitad pública del par de VAPID_PRIVATE_JWK.");
  }

  // Se quitan las comillas envolventes: el script imprime la línea lista para
  // `.env.local`, donde el JWK VA entrecomillado, y esa misma línea acaba
  // pegada en el formulario de Vercel, que guarda el valor literal.
  const limpio = raw.trim().replace(/^(['"])([\s\S]*)\1$/, "$2");

  // FORMA PREFERIDA: solo el componente `d`, 43 caracteres base64url sin un
  // signo de puntuación. Se admite el JWK entero por compatibilidad, pero es
  // frágil de transportar — el importador masivo de variables de Vercel le
  // quita las comillas dobles, también las de dentro, y lo deja como
  // `{kty:EC,...}`, que ya no es JSON. Ocurrió dos veces antes de esto.
  const privateJwk: JsonWebKey = limpio.startsWith("{")
    ? parsearJwk(limpio)
    : jwkFromPrivateKey(limpio, publicKey);

  /**
   * `sub` identifica a quien envía. Apple lo VALIDA: si no es un `mailto:` o un
   * `https:`, responde 403 `BadJwtToken` — el mismo error que da una firma
   * inválida, así que sin esta comprobación se confunden dos causas muy
   * distintas.
   *
   * Se valida aquí y no se deja pasar porque el default es una trampa: cae a
   * `NEXT_PUBLIC_APP_URL`, que en local (y en un despliegue mal configurado) es
   * `http://localhost:3000` — sintácticamente una URL, y rechazada por Apple.
   */
  // La normalización vive en el dominio y está probada allí: admite el correo
  // suelto (le pone `mailto:`), quita comillas, y rechaza con un mensaje
  // concreto lo que Apple rechazaría — incluidos los huecos de documentación
  // sin rellenar, que se han pegado tal cual más de una vez.
  const subject = normalizeVapidSubject(process.env.VAPID_SUBJECT || publicEnv.NEXT_PUBLIC_APP_URL);

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

/**
 * F11: el secreto del Arquitecto de Manifestación (D-164).
 *
 * ES DE OTRA CATEGORÍA QUE `PUSH_DISPATCH_SECRET`, y por eso es OTRA variable
 * aunque las dos protejan rutas sin sesión. Aquél dispara TRABAJO: quien lo
 * tuviera podría hacer que se envíen avisos antes de tiempo. Éste devuelve
 * CONTENIDO: identidad, visión, reflexiones y hechos de cualquier `user_id` que
 * se pida. Reutilizar el mismo valor convertiría una filtración molesta en una
 * filtración íntima, y la rotación de uno arrastraría al otro.
 *
 * Lo exigen las dos rutas de `/api/agents/manifestation/` y el cliente que
 * llama al agente. Sin él, el agente no está configurado y todo el módulo cae
 * al respaldo en TypeScript, que es un camino probado: la persona recibe su
 * brief igual.
 */
export function requireManifestationAgentSecret(): string {
  const secret = process.env.MANIFESTATION_AGENT_SECRET;
  if (!secret) {
    throw new Error(
      "MANIFESTATION_AGENT_SECRET no está definida. La exigen /api/agents/manifestation/* y el cliente del agente — ver /docs/DEPLOY.md."
    );
  }
  return secret;
}

/**
 * Dónde vive el agente, o `null` si no hay agente.
 *
 * NO LANZA, al contrario que el resto de este archivo, y es la diferencia que
 * hace que el respaldo funcione: «no hay agente» es una configuración válida y
 * frecuente —en local, en una previsualización, mientras el contenedor se
 * redespliega— y no un error que haya que enseñar. Quien llama ve `null` y
 * genera en TypeScript sin gastar un `fetch` ni un milisegundo de espera.
 */
export function manifestationAgentUrl(): string | null {
  const url = process.env.MANIFESTATION_AGENT_URL?.trim();
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

/**
 * Cuánto se espera al agente antes de escribir el brief en casa.
 *
 * Veinte segundos, y el número tiene detrás una suma: generar con el modelo ya
 * tarda de cinco a quince, y el agente añade el viaje de ida y vuelta del
 * contexto. Por encima de veinte, el respaldo —que necesita sus propios diez—
 * ya no cabe en el presupuesto de la función y la persona se quedaría sin nada,
 * que es exactamente lo que el respaldo existe para evitar.
 */
export function manifestationAgentTimeoutMs(): number {
  const crudo = Number(process.env.MANIFESTATION_AGENT_TIMEOUT_MS);
  return Number.isFinite(crudo) && crudo > 0 ? crudo : 20_000;
}

/**
 * ¿El mensaje del coach lo decide el Agentic Kernel? (D-173)
 *
 * APAGADO MIENTRAS NO SE DIGA LO CONTRARIO, y ese defecto es la mitad del
 * valor: con la variable sin poner, el despacho nocturno se comporta
 * exactamente igual que antes de que el Kernel existiera. Encenderla es una
 * decisión de operación, no un despliegue; apagarla, también.
 *
 * Se mira por persona no, por instalación sí: el coach corre en un bucle sobre
 * todo el mundo dentro de la misma pasada, y un reparto por usuario haría que
 * un fallo del Kernel se viera en unos y no en otros, que es el peor escenario
 * para diagnosticar. O todos o ninguno, y el salto atrás es una variable.
 */
export function coachPorElKernel(): boolean {
  return process.env.AGENT_KERNEL_COACH?.trim() === "1";
}

/**
 * ¿El análisis nocturno lo decide el Agentic Kernel? (D-175)
 *
 * Variable propia y no la misma del coach, a propósito: dos agentes que se
 * encienden juntos no se pueden diagnosticar por separado, y el primero en
 * fallar se llevaría la culpa del otro. Se encienden de uno en uno.
 *
 * Solo afecta al camino NOCTURNO. El botón «Analizar» nunca pasa por el Kernel:
 * ahí la persona está mirando la pantalla y esperando una respuesta, y un
 * restraint que decidiera callarse sería un botón que no hace nada.
 */
export function insightsPorElKernel(): boolean {
  return process.env.AGENT_KERNEL_INSIGHTS?.trim() === "1";
}


/**
 * Lee el JWK completo, la forma antigua de `VAPID_PRIVATE_JWK`.
 *
 * Se conserva para no invalidar las instalaciones que ya lo tienen puesto, pero
 * el mensaje de error empuja a la forma simple: si el objeto llegó sin sus
 * comillas internas, no hay nada que reparar en el texto y sí una variable que
 * sustituir por algo que ningún parser pueda estropear.
 */
function parsearJwk(valor: string): JsonWebKey {
  let jwk: JsonWebKey;
  try {
    jwk = JSON.parse(valor) as JsonWebKey;
  } catch {
    throw new Error(
      `VAPID_PRIVATE_JWK no es un JSON válido (empieza por «${valor.slice(0, 14)}…»). Si las comillas de dentro han desaparecido, las quitó el importador de variables. Sustituye el valor por SOLO el componente \`d\` (43 caracteres, sin llaves ni comillas) que imprime \`node scripts/generate-vapid.mjs\`.`
    );
  }

  // Un JWK que parsea pero no es una clave privada EC pasaría hasta `importKey`
  // y fallaría allí con un error de WebCrypto que no menciona la variable.
  if (jwk.kty !== "EC" || !jwk.d) {
    throw new Error('VAPID_PRIVATE_JWK parsea pero no es una clave privada EC (falta `kty: "EC"` o el componente `d`).');
  }
  return jwk;
}
