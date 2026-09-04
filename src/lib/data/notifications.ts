import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";

/**
 * La bandeja: todo lo que hay que contarle a quien mira, sin leer.
 *
 * SUSTITUYE A `loadUnreadMentions` COMO FUENTE DE LA CAMPANA. Aquella derivaba
 * las menciones de `comments` en cada render; ahora las menciones se
 * materializan como filas de `notifications` al escribirse el comentario
 * (0049), junto a las asignaciones, los recordatorios y los vencimientos. Una
 * campana que enseña cuatro cosas no puede tener cuatro consultas distintas.
 *
 * Las menciones que estaban sin leer el día del despliegue las trajo el
 * backfill de 0049, así que el cambio de fuente no pierde nada.
 *
 * `cache()` de React deduplica por request: la insignia de la barra y el panel
 * desplegable la piden en el mismo render.
 */

export interface NotificationRow {
  id: string;
  kind: "mention" | "task.assigned" | "reminder" | "task.due";
  title: string;
  body: string;
  /** Dónde lleva. Se guardó armado al crearla; aquí no se decide nada. */
  href: string;
  createdAt: string;
  /**
   * El comentario de origen, si es una mención. Sale de `dedupe_key`
   * (`mention:<comment_id>`) y no de una columna propia: la clave ya lo
   * contiene y una segunda columna con el mismo dato acabaría discrepando.
   */
  commentId: string | null;
}

/** Tope de la bandeja. Más allá de esto no es una bandeja, es un archivo. */
const MAX_NOTIFICACIONES = 30;

export const loadUnreadNotifications = cache(async (): Promise<NotificationRow[]> => {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return [];

  // Sin filtrar por `user_id`: la RLS de `notifications` ya solo devuelve las
  // propias, y repetirlo aquí daría a entender que la cerradura es esta.
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, href, created_at, dedupe_key")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_NOTIFICACIONES);

  return (data ?? []).map((n) => ({
    id: n.id,
    kind: n.kind as NotificationRow["kind"],
    title: n.title,
    body: n.body,
    href: n.href,
    createdAt: n.created_at,
    commentId: n.dedupe_key.startsWith("mention:") ? n.dedupe_key.slice("mention:".length) : null
  }));
});
