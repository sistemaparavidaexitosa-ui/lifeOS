"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { publicEnv } from "@/config/env";

/** Cliente Supabase para Client Components (navegador). Respeta RLS siempre. */
export function createClient() {
  return createBrowserClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
