"use server";
import "server-only";
// src/lib/money/watchlist-actions.ts
// Qué sigues del mercado (D-184).
//
// Mismo contrato que el resto de acciones de la casa (D-021): NO lanzan,
// devuelven `{ ok, reason }` con un motivo que se pueda pintar.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { MAX_WATCHLIST, normalizarTicker } from "@/lib/domain/money/watchlist.ts";
import { actionFailed, actionOk, type ActionResult } from "@/lib/supabase/errors";

export interface FilaDeWatchlist {
  id: string;
  ticker: string;
  nombre: string;
}

export async function listarWatchlist(): Promise<FilaDeWatchlist[]> {
  const user = await getSessionUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("watchlist")
    .select("id, ticker, nombre")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return data ?? [];
}

export async function seguirTicker(crudo: string, nombre: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Sin sesión." };

  const ticker = normalizarTicker(crudo);
  if (!ticker) return { ok: false, reason: `«${crudo}» no parece un símbolo del mercado.` };

  const supabase = await createClient();

  // El tope se comprueba aquí y no con un `check` en la base: veinte no es una
  // invariante de integridad, es una decisión de producto que puede cambiar sin
  // migración.
  const { count } = await supabase
    .from("watchlist")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) >= MAX_WATCHLIST) {
    return { ok: false, reason: `Ya sigues ${MAX_WATCHLIST}. Quita alguno antes de añadir otro.` };
  }

  const { error } = await supabase
    .from("watchlist")
    .insert({ user_id: user.id, ticker, nombre: nombre.slice(0, 120) });

  // 23505 es el único duplicado en esta tabla, y no es un fallo: seguir dos
  // veces lo mismo no es seguirlo más.
  if (error?.code === "23505") return actionOk;
  if (error) return actionFailed(error);

  revalidatePath("/money/watchlist");
  return actionOk;
}

export async function dejarDeSeguir(id: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Sin sesión." };

  const supabase = await createClient();
  const { error } = await supabase.from("watchlist").delete().eq("id", id).eq("user_id", user.id);
  if (error) return actionFailed(error);

  revalidatePath("/money/watchlist");
  return actionOk;
}
