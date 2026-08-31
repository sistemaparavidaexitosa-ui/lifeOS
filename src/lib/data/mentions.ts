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
  /** El título de la tarea, o el del proyecto si la mención fue en su hilo. */
  subjectTitle: string;
  /** Dónde lleva el aviso. La bandeja navega aquí y no arma la URL a mano. */
  href: string;
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
      .select("id, subject_type, subject_id, body, author_name, created_at")
      // Sin filtrar por subject_type: desde que existe el hilo del proyecto,
      // «@Victor, aplica las migraciones» puede escribirse ahí, y filtrando por
      // 'task' ese aviso no llegaba a ninguna parte.
      .contains("mentioned_user_ids", [user.id])
      .neq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_MENTIONS * 2),
    supabase.from("comment_reads").select("comment_id").eq("user_id", user.id)
  ]);

  const leidos = new Set((reads ?? []).map((r) => r.comment_id));
  const pendientes = (comments ?? []).filter((c) => !leidos.has(c.id)).slice(0, MAX_MENTIONS);
  if (!pendientes.length) return [];

  // El título de DÓNDE te mencionaron. Sin esto, una lista de frases sueltas no
  // lleva a ninguna parte. Dos consultas y no un join: `comments` es polimórfica
  // (subject_type + subject_id) y por eso no tiene clave foránea a ninguna de
  // las dos tablas.
  const taskIds = [...new Set(pendientes.filter((c) => c.subject_type === "task").map((c) => c.subject_id))];
  const projectIds = [...new Set(pendientes.filter((c) => c.subject_type === "project").map((c) => c.subject_id))];

  const [{ data: tasks }, { data: projects }] = await Promise.all([
    taskIds.length
      ? supabase.from("tasks").select("id, title").in("id", taskIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    projectIds.length
      ? supabase.from("projects").select("id, title").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] })
  ]);

  const porTarea = new Map((tasks ?? []).map((t) => [t.id, t.title]));
  const porProyecto = new Map((projects ?? []).map((p) => [p.id, p.title]));

  return pendientes.flatMap((c) => {
    // Si el sujeto ya no existe, la mención no lleva a ningún sitio: se calla.
    const title = c.subject_type === "task" ? porTarea.get(c.subject_id) : porProyecto.get(c.subject_id);
    if (!title) return [];
    return [
      {
        commentId: c.id,
        subjectTitle: title,
        href:
          c.subject_type === "task"
            ? `/execution?task=${c.subject_id}`
            : `/execution?project=${c.subject_id}&view=hilo`,
        body: c.body,
        authorName: c.author_name,
        createdAt: c.created_at
      }
    ];
  });
});
