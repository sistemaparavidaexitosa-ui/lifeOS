"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const memberSchema = z.object({
  name: z.string().min(1),
  relationship: z.enum(["Cónyuge", "Hijo/a", "Padre", "Madre", "Otro"]),
  memberType: z.enum(["Adulto", "Dependiente"])
});

/** FR-MNY-013: crear/editar miembro de hogar. BR-020: gestión exclusiva del titular, no es un rol de workspace. */
export async function upsertFamilyMember(id: string | null, formData: FormData) {
  const parsed = memberSchema.parse({
    name: formData.get("name"),
    relationship: formData.get("relationship"),
    memberType: formData.get("memberType")
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = { name: parsed.name, relationship: parsed.relationship, member_type: parsed.memberType };

  if (id) {
    const { error } = await supabase.from("family_members").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "household.member.update", object: id });
  } else {
    const { error } = await supabase.from("family_members").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "household.member.create" });
  }
  revalidatePath("/household");
}

/**
 * Eliminar un miembro NO elimina sus transacciones/metas/inversiones; quedan
 * sin atribuir (ON DELETE SET NULL en las FK), consistente con BR-021.
 */
export async function deleteFamilyMember(id: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("family_members").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "household.member.delete", object: id });
  revalidatePath("/household");
  revalidatePath("/money");
  revalidatePath("/investments");
  revalidatePath("/goals");
}
