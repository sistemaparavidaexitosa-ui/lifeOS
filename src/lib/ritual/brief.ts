import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { todayForUser } from "@/lib/data/profile";
import { actionFailed, type ActionResult } from "@/lib/supabase/errors";
import { generateTodayBrief } from "@/lib/identity/brief-actions";
import type { BriefView } from "@/lib/identity/brief-view";

/**
 * El respaldo del brief, cuando la mañana llega sin uno (D-165).
 *
 * NO INVENTA UN CAMINO NUEVO: llama a `generateTodayBrief()`, la misma acción
 * del botón de la tarjeta de identidad, que baja por la cadena de siempre
 * —agente Python, y si no contesta, el respaldo en TypeScript— hasta
 * `guardarBrief()`, que sigue siendo el único escritor de `identity_briefs` y el
 * único que cuenta el tope de tres generaciones al día.
 *
 * UN INTENTO POR PERSONA Y DÍA, con la marca escrita ANTES de llamar al modelo:
 * si la llamada se cae a mitad, no se reintenta sola en la siguiente carga.
 *
 * Vive fuera de `actions.ts` a propósito: se sirve por un Route Handler y no
 * como Server Action. Ver `src/app/api/ritual/brief/route.ts`.
 */
export async function asegurarBriefDeHoy(): Promise<ActionResult & { brief?: BriefView }> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const today = await todayForUser();

  const { data: run } = await supabase
    .from("ritual_runs")
    .select("brief_attempted")
    .eq("user_id", user.id)
    .eq("local_date", today)
    .maybeSingle();
  if (run?.brief_attempted) {
    return { ok: false, reason: "El brief de hoy ya se intentó una vez desde el arranque." };
  }

  // `upsert` y no `update`: el overlay dispara esto y `startRitual` A LA VEZ al
  // montar, y si esta llegaba primero, el `update` no encontraba fila y la marca
  // no se escribía. Solo se mandan estas tres columnas, así que si la fila ya
  // existe no se pisan ni `started_at` ni el progreso.
  const { error } = await supabase
    .from("ritual_runs")
    .upsert({ user_id: user.id, local_date: today, brief_attempted: true }, { onConflict: "user_id,local_date" });
  if (error) return actionFailed(error);

  return generateTodayBrief();
}
