import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";

/**
 * QUIÉN HIZO QUÉ EN EL ESPACIO.
 *
 * `workspace_activity` existe desde 0003, pero hasta ahora la escribían cuatro
 * Server Actions con el mismo bloque copiado cuatro veces — y las cuatro
 * guardaban `actor: user.email`. Eso tenía dos problemas: crear una tarea o
 * cambiar un estado no dejaba rastro ninguno, y el rastro que sí había
 * enseñaba el CORREO de un compañero a todo el espacio.
 *
 * Aquí se centraliza para que añadir un evento cueste una línea en la acción
 * que lo provoca, y para que el nombre se resuelva en un solo sitio.
 *
 * NUNCA LANZA. El feed es un efecto secundario: un espacio sin fila de
 * actividad es un feed incompleto, pero una excepción aquí tumbaría el cambio
 * de estado que ya ocurrió y lo presentaría como un fallo. Es el mismo criterio
 * best-effort que tenían los cuatro `try/catch` que esto sustituye.
 */

/**
 * El nombre visible del usuario actual.
 *
 * `profiles` es privada de cada quien (RLS `user_id = auth.uid()`), así que
 * esto solo funciona para uno mismo — que es exactamente el caso: quien
 * registra la actividad es quien la hizo.
 *
 * El correo queda de último recurso y no de primero. Antes era el único valor,
 * y por eso el feed enseñaba correos: un perfil sin nombre es raro, un espacio
 * entero mirando el correo de alguien no debería ser lo normal.
 *
 * `cache()` de React: una acción masiva escribe varias filas en el mismo
 * request y no tiene por qué preguntar el nombre más de una vez.
 */
export const getActorName = cache(async (): Promise<string> => {
  try {
    const supabase = await createClient();
    const user = await getSessionUser();
    if (!user) return "";

    const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();
    if (profile?.name?.trim()) return profile.name.trim();

    // Sin perfil con nombre, la membresía guarda su propia copia (`user_name`,
    // congelada al aceptar la invitación). No es tan buena —puede estar
    // desactualizada— pero sigue siendo un nombre y no un correo.
    const { data: membership } = await supabase
      .from("memberships")
      .select("user_name")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (membership?.user_name?.trim()) return membership.user_name.trim();

    return user.email ?? "";
  } catch {
    return "";
  }
});

export interface ActivityInput {
  /** Cuelga el evento de un proyecto: da el enlace «Abrir» y resuelve el espacio. */
  projectId?: string | null;
  /** Cuando el evento no es de ningún proyecto (invitaciones, bajas). */
  workspaceId?: string | null;
  /** Texto libre en el esquema (0003). Ver TYPE_LABEL en domain/execution/activity.ts. */
  type: string;
  /**
   * Qué pasó, SIN el nombre de quien lo hizo: «creó la tarea "X"».
   *
   * El autor va en su propia columna porque las dos pantallas que leen esto lo
   * colocan en sitios distintos — el hilo lo pone delante de la frase, /activity
   * al margen junto a la hora. Metido en el texto habría que recortarlo a ojo.
   */
  text: string;
}

export async function recordActivity(input: ActivityInput): Promise<void> {
  try {
    const supabase = await createClient();
    const user = await getSessionUser();
    if (!user) return;

    let workspaceId = input.workspaceId ?? null;
    const projectId = input.projectId ?? null;

    if (!workspaceId && projectId) {
      const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", projectId).single();
      workspaceId = project?.workspace_id ?? null;
    }

    // Sin espacio no hay dónde colgarlo: la fila exige workspace_id y su
    // política de INSERT pregunta por la membresía de ese espacio.
    if (!workspaceId) return;

    await supabase.from("workspace_activity").insert({
      workspace_id: workspaceId,
      project_id: projectId,
      type: input.type,
      text: input.text,
      actor: await getActorName(),
      actor_id: user.id
    });
  } catch {
    // best-effort: el feed nunca puede tumbar la acción que lo genera.
  }
}
