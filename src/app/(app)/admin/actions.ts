"use server";
// Las escrituras del catálogo de plantillas. Solo un administrador llega aquí.
//
// TRES CONTROLES, NO UNO, y no es paranoia repetida: es el mismo criterio de
// defensa en profundidad que el README ya declara para BR-012.
//
//   1. La RUTA está oculta: /admin devuelve 404 a quien no es admin.
//   2. La RLS de 0044 rechaza el `insert`/`update` de cualquiera que no lo sea.
//   3. Y aun así, cada acción de aquí vuelve a preguntarlo antes de escribir.
//
// El tercero existe porque una Server Action es un endpoint HTTP: se puede
// invocar sin pasar por la pantalla. Sin él, la única defensa real sería la
// RLS — que basta, pero que dejaría el error como un fallo de base de datos
// ilegible en vez de un «no tienes permiso» que se puede pintar.
//
// Contrato `{ ok, reason }` (D-030): estas acciones las llama un Client
// Component que necesita pintar el motivo si algo falla.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { isPlatformAdmin } from "@/lib/data/templates";
import { TEMPLATE_SCHEMA_BY_KIND, TEMPLATE_KINDS, slugSchema, type TemplateKind } from "@/lib/domain/templates/schema.ts";
import { actionFailed, type ActionResult } from "@/lib/supabase/errors";

const kindSchema = z.enum(TEMPLATE_KINDS);

/**
 * Las pantallas que muestran el catálogo, para repintarlas al publicar.
 *
 * Si no se revalidan, un administrador publica una plantilla y no la ve en el
 * selector hasta que Next decida rehacer la página: parece que no se guardó.
 */
const PANTALLAS: Record<TemplateKind, string[]> = {
  project: ["/execution"],
  routine: ["/development/routines", "/development"],
  habit: ["/development/habits", "/development"]
};

async function exigirAdmin(): Promise<{ userId: string } | { error: ActionResult }> {
  const user = await getSessionUser();
  if (!user) return { error: { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." } };
  if (!(await isPlatformAdmin())) {
    return { error: { ok: false, reason: "Solo un administrador puede editar el catálogo de plantillas." } };
  }
  return { userId: user.id };
}

function repintar(kind: TemplateKind) {
  revalidatePath("/admin");
  revalidatePath(`/admin/${kind}`);
  for (const ruta of PANTALLAS[kind]) revalidatePath(ruta);
}

/**
 * Crea o actualiza una plantilla. El `slug` es la identidad: si ya existe, se
 * sobrescribe; si no, nace.
 *
 * `status` no se toca aquí. Guardar y publicar son dos gestos distintos a
 * propósito: si guardar publicara, corregir una errata en una plantilla viva
 * la expondría a medio escribir a quien esté eligiendo en ese momento — que es
 * exactamente el riesgo por el que existe el borrador.
 */
export async function saveTemplate(kind: string, slug: string, payload: unknown): Promise<ActionResult> {
  const k = kindSchema.safeParse(kind);
  const s = slugSchema.safeParse(slug);
  if (!k.success) return { ok: false, reason: "Ese tipo de plantilla no existe." };
  if (!s.success) return { ok: false, reason: s.error.issues[0]?.message ?? "El identificador no es válido." };

  const sesion = await exigirAdmin();
  if ("error" in sesion) return sesion.error;

  const parsed = TEMPLATE_SCHEMA_BY_KIND[k.data].safeParse(payload);
  if (!parsed.success) {
    const problema = parsed.error.issues[0];
    const donde = problema?.path.length ? `${problema.path.join(" → ")}: ` : "";
    return { ok: false, reason: `${donde}${problema?.message ?? "La plantilla no es válida."}` };
  }

  // El `id` de dentro y el `slug` de la columna tienen que ser el mismo: la
  // columna es por donde se busca y el `id` es lo que la interfaz devuelve al
  // aplicar. Separados, el selector ofrecería algo que después no encuentra.
  if (parsed.data.id !== s.data) {
    return { ok: false, reason: "El identificador de dentro de la plantilla no coincide con el de la fila." };
  }

  const supabase = await createClient();

  // Se guarda `parsed.data`, NO lo que llegó. Ésa es la línea que hace cumplir
  // las ausencias del dominio: una tarea con `due` o con `impact` pierde el
  // campo aquí, porque el esquema no lo declara y zod se lo queda fuera.
  const { error } = await supabase.from("template_catalog").upsert(
    {
      kind: k.data,
      slug: s.data,
      payload: parsed.data,
      updated_by: sesion.userId,
      updated_at: new Date().toISOString()
    },
    { onConflict: "kind,slug", ignoreDuplicates: false }
  );
  if (error) return actionFailed(error);

  await supabase
    .from("audit_log")
    .insert({ user_id: sesion.userId, action: "admin.template.save", object: `${k.data}/${s.data}` });

  repintar(k.data);
  return { ok: true };
}

/** Publicar o retirar. Es el único gesto que cambia lo que ve el resto. */
export async function setTemplateStatus(kind: string, slug: string, status: string): Promise<ActionResult> {
  const k = kindSchema.safeParse(kind);
  const st = z.enum(["draft", "published"]).safeParse(status);
  if (!k.success || !st.success) return { ok: false, reason: "Petición no válida." };

  const sesion = await exigirAdmin();
  if ("error" in sesion) return sesion.error;

  const supabase = await createClient();

  // Publicar una plantilla que no pasa el esquema la haría invisible: la capa
  // de lectura descarta lo que no valida, así que el administrador vería
  // «publicada» y el usuario no vería nada. Se comprueba antes de publicar.
  if (st.data === "published") {
    const { data: fila } = await supabase
      .from("template_catalog")
      .select("payload")
      .eq("kind", k.data)
      .eq("slug", slug)
      .maybeSingle();
    if (!fila) return { ok: false, reason: "Esa plantilla ya no existe." };
    if (!TEMPLATE_SCHEMA_BY_KIND[k.data].safeParse(fila.payload).success) {
      return { ok: false, reason: "Esta plantilla no pasa la validación: publicada, nadie la vería. Revísala antes." };
    }
  }

  const { error } = await supabase
    .from("template_catalog")
    .update({ status: st.data, updated_by: sesion.userId, updated_at: new Date().toISOString() })
    .eq("kind", k.data)
    .eq("slug", slug);
  if (error) return actionFailed(error);

  await supabase.from("audit_log").insert({
    user_id: sesion.userId,
    action: st.data === "published" ? "admin.template.publish" : "admin.template.unpublish",
    object: `${k.data}/${slug}`
  });

  repintar(k.data);
  return { ok: true };
}

/**
 * Borra una plantilla del catálogo.
 *
 * No toca a NADIE que ya la haya aplicado: al usarla se copió a las tablas del
 * usuario, y esas filas son suyas. Aun así, despublicar suele ser mejor que
 * borrar —deja de ofrecerse pero se puede recuperar— y por eso la interfaz lo
 * ofrece primero.
 */
export async function deleteTemplate(kind: string, slug: string): Promise<ActionResult> {
  const k = kindSchema.safeParse(kind);
  if (!k.success) return { ok: false, reason: "Ese tipo de plantilla no existe." };

  const sesion = await exigirAdmin();
  if ("error" in sesion) return sesion.error;

  const supabase = await createClient();
  const { error } = await supabase.from("template_catalog").delete().eq("kind", k.data).eq("slug", slug);
  if (error) return actionFailed(error);

  await supabase
    .from("audit_log")
    .insert({ user_id: sesion.userId, action: "admin.template.delete", object: `${k.data}/${slug}` });

  repintar(k.data);
  return { ok: true };
}
