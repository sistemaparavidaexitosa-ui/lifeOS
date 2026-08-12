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
 * Uso: SOLO dentro de Route Handlers (`src/app/api/**\/route.ts`) que
 * necesiten saltar RLS explícitamente (p. ej. jobs administrativos). Nunca
 * en Server Components ni Server Actions de flujo normal de usuario.
 */
export function createAdminClient() {
  const serviceRoleKey = requireServiceRoleKey(); // lanza en runtime si falta, nunca en build
  return createSupabaseClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
