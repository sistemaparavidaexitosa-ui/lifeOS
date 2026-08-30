"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Marcar una mención como leída.
 *
 * Escribe en `comment_reads`, no en `comments.read`. Además de que aquella
 * columna es un booleano compartido por todos los lectores, escribirla exigiría
 * una política UPDATE sobre `comments` — y una política que permita marcar
 * leído permite también reescribir el `body` de otro. El aviso de una mención
 * no puede costar eso.
 *
 * `upsert` con `ignoreDuplicates`: la clave primaria compuesta ya hace que
 * marcar dos veces sea inofensivo, y así dos clics seguidos no devuelven error.
 */
export async function markMentionRead(commentId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("comment_reads")
    .upsert({ comment_id: commentId, user_id: user.id }, { onConflict: "comment_id,user_id", ignoreDuplicates: true });

  revalidatePath("/execution");
}

/** Vaciar la bandeja de una vez. */
export async function markAllMentionsRead(commentIds: string[]): Promise<void> {
  if (!commentIds.length) return;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("comment_reads")
    .upsert(
      commentIds.map((id) => ({ comment_id: id, user_id: user.id })),
      { onConflict: "comment_id,user_id", ignoreDuplicates: true }
    );

  revalidatePath("/execution");
}
