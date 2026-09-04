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
  NEXT_PUBLIC_DEFAULT_CURRENCY: z.string().default("MXN")
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
  NEXT_PUBLIC_DEFAULT_CURRENCY: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY
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
