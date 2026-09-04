"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Marcar avisos como leídos.
 *
 * ⚠️ UNA MENCIÓN SE MARCA EN DOS SITIOS, Y NO ES REDUNDANCIA.
 * `notifications.read_at` vacía la campana. Pero `comment_reads` (0037) la
 * sigue leyendo alguien más: `src/lib/insights/facts-loader.ts` construye con
 * ella el hecho «tienes N menciones sin leer» que alimenta Intelligence OS.
 * Si aquí solo se escribiera la primera, el motor seguiría diciendo que tienes
 * menciones pendientes semanas después de haberlas leído — y lo diría con
 * total convicción, que es la peor forma de equivocarse.
 *
 * El id del comentario sale de `dedupe_key`, que es `mention:<comment_id>`.
 */

export async function markNotificationRead(id: string, commentId: string | null): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);

  if (commentId) await marcarComentarios(supabase, user.id, [commentId]);

  revalidatePath("/execution");
}

/** Vaciar la bandeja de una vez. */
export async function markAllNotificationsRead(ids: string[], commentIds: string[]): Promise<void> {
  if (!ids.length) return;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);

  if (commentIds.length) await marcarComentarios(supabase, user.id, commentIds);

  revalidatePath("/execution");
}

async function marcarComentarios(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  commentIds: string[]
): Promise<void> {
  // `upsert` con `ignoreDuplicates`: la clave primaria compuesta de
  // `comment_reads` ya hace que marcar dos veces sea inofensivo, y así dos
  // clics seguidos no devuelven error.
  await supabase
    .from("comment_reads")
    .upsert(
      commentIds.map((comment_id) => ({ comment_id, user_id: userId })),
      { onConflict: "comment_id,user_id", ignoreDuplicates: true }
    );
}
