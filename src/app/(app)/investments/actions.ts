"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/domain/budget.ts";

const investmentSchema = z.object({
  kind: z.enum(["fija", "variable"]),
  name: z.string().min(1),
  institutionOrBroker: z.string().optional().default(""),
  principal: z.coerce.number().min(0),
  rate: z.coerce.number().default(0),
  valuation: z.coerce.number().min(0),
  asOf: z.string(),
  source: z.string().min(1),
  familyMemberId: z.string().uuid().optional().or(z.literal(""))
});

/** FR-INV-001…007: toda rentabilidad exige metodología, moneda, período y fuente (FR-INV-002). */
export async function upsertInvestment(id: string | null, formData: FormData) {
  const parsed = investmentSchema.parse({
    kind: formData.get("kind"),
    name: formData.get("name"),
    institutionOrBroker: formData.get("institutionOrBroker") ?? "",
    principal: formData.get("principal"),
    rate: formData.get("rate") ?? 0,
    valuation: formData.get("valuation"),
    asOf: formData.get("asOf"),
    source: formData.get("source"),
    familyMemberId: formData.get("familyMemberId") ?? ""
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    kind: parsed.kind,
    name: parsed.name,
    institution: parsed.kind === "fija" ? parsed.institutionOrBroker : "",
    broker: parsed.kind === "variable" ? parsed.institutionOrBroker : "",
    principal: round2(parsed.principal),
    rate: parsed.rate,
    valuation: round2(parsed.valuation),
    as_of: parsed.asOf,
    source: parsed.source,
    family_member_id: parsed.familyMemberId || null
  };

  if (id) {
    const { error } = await supabase.from("investments").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("investments").insert({ ...payload, user_id: user.id, currency: "MXN" });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/investments");
}

export async function deleteInvestment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("investments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/investments");
}
