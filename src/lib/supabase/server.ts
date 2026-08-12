import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { publicEnv } from "@/config/env";

/**
 * Cliente Supabase para Server Components y Server Actions. Usa la ANON key
 * (respeta RLS siempre) y el patrón oficial de @supabase/ssr para
 * lectura/escritura de cookies de sesión en el App Router.
 *
 * NUNCA usar aquí el service_role — para eso existe `admin.ts`, que se
 * importa SOLO en Route Handlers que explícitamente necesitan saltar RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Se puede ignorar si setAll se llama desde un Server Component:
          // el middleware refresca la sesión en cada request (ver middleware.ts).
        }
      }
    }
  });
}
