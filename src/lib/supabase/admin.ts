import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { publicEnv } from "@/config/env";
import { requireServiceRoleKey } from "@/config/env";

/**
 * F11 🔴: este cliente lee ÚNICAMENTE `SUPABASE_SERVICE_ROLE_KEY` (validación
 * lazy, en el primer uso — nunca a nivel de módulo). NO exige ningún otro
 * secreto (Stripe, OTP, Resend, etc.), aunque esos existan en el proyecto.
 *
 * `import "server-only"` garantiza que un bundler que intente incluir este
 * archivo en el bundle de cliente falle en build time, no en producción.
 *
 * Uso: dentro de Route Handlers (`src/app/api/**\/route.ts`) que necesiten
 * saltar RLS explícitamente (p. ej. jobs administrativos). Nunca en Server
 * Components ni Server Actions de flujo normal de usuario.
 *
 * ⚠️ UNA EXCEPCIÓN, DOCUMENTADA (notificaciones push, 2026-09-04).
 * `src/lib/push/send.ts` lo usa también desde Server Actions, y no por
 * comodidad: para avisarte a TI hay que leer TUS suscripciones, y quien
 * provoca el aviso es OTRA persona (te mencionó, te asignó una tarea). La RLS
 * de `push_subscriptions` no expone las ajenas a propósito —`endpoint` +
 * `p256dh` + `auth` bastan para hacerle sonar el teléfono a cualquiera— y un
 * `security definer` que las devolviera sería esa misma exposición con otro
 * nombre. El alcance está acotado: `sendPush` solo lee esa tabla, nunca lanza,
 * y ninguna otra Server Action importa este cliente.
 */
export function createAdminClient() {
  const serviceRoleKey = requireServiceRoleKey(); // lanza en runtime si falta, nunca en build
  return createSupabaseClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
