import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";

/**
 * Las menciones dirigidas a mí que todavía no he leído.
 *
 * POR QUÉ ESTA CONSULTA Y NO `comments.read`
 * Esa columna existe desde 0003 y es UN booleano en la fila del comentario: el
 * primero que lo marcara lo marcaría para todos. En un comentario que menciona
 * a tres personas eso es sencillamente falso, así que lo leído vive en
 * `comment_reads`, una fila por lector (migración 0037).
 *
 * No hace falta comprobar permisos aquí: la RLS de `comments` ya limita lo que
 * se puede leer al proyecto al que se tiene acceso.
 *
 * `cache()` de React deduplica por request, igual que getSessionUser: la
 * insignia de la barra y el panel desplegable la piden en el mismo render.
 */

export interface MentionRow {
  commentId: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  body: string;
  authorName: string;
  createdAt: string;
}

/** Tope de la bandeja. Más allá de esto no es una bandeja, es un archivo. */
const MAX_MENTIONS = 30;

export const loadUnreadMentions = cache(async (): Promise<MentionRow[]> => {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return [];

  // `contains` sobre el array de ids, que es lo que sostiene el índice GIN de
  // 0037. Preguntar por el nombre volvería a ser adivinar.
  const [{ data: comments }, { data: reads }] = await Promise.all([
    supabase
      .from("comments")
      .select("id, subject_id, body, author_name, created_at")
      .eq("subject_type", "task")
      .contains("mentioned_user_ids", [user.id])
      .neq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_MENTIONS * 2),
    supabase.from("comment_reads").select("comment_id").eq("user_id", user.id)
  ]);

  const leidos = new Set((reads ?? []).map((r) => r.comment_id));
  const pendientes = (comments ?? []).filter((c) => !leidos.has(c.id)).slice(0, MAX_MENTIONS);
  if (!pendientes.length) return [];

  // El título de la tarea y su proyecto, para que la bandeja diga DÓNDE te
  // mencionaron. Sin esto, una lista de frases sueltas no lleva a ninguna parte.
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, project_id")
    .in("id", [...new Set(pendientes.map((c) => c.subject_id))]);

  const porTarea = new Map((tasks ?? []).map((t) => [t.id, t]));

  return pendientes.flatMap((c) => {
    const task = porTarea.get(c.subject_id);
    // Si la tarea ya no existe, la mención no lleva a ningún sitio: se calla.
    if (!task) return [];
    return [
      {
        commentId: c.id,
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.project_id,
        body: c.body,
        authorName: c.author_name,
        createdAt: c.created_at
      }
    ];
  });
});
