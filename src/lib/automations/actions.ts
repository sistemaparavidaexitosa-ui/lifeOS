"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";
import { isImpactAction, type ActionType, type TriggerType } from "@/lib/domain/automations/rules.ts";

/**
 * Alta y baja de reglas. La ejecución vive en dispatch.ts; aquí solo se
 * guardan.
 *
 * Los enums se validan con zod ADEMÁS del `check` de la base: el `check` es la
 * última barrera y devuelve un error de Postgres que no se le puede enseñar a
 * nadie. Este devuelve una frase.
 */
const schema = z.object({
  name: z.string().min(1).max(80),
  triggerType: z.enum(["task.status_changed", "task.assigned", "comment.added"]),
  triggerTo: z.string().optional(),
  triggerOnlyMine: z.boolean().default(false),
  actionType: z.enum(["create_task", "set_status", "log_entry", "create_reminder"]),
  actionText: z.string().max(300).default(""),
  actionTo: z.string().optional(),
  actionPreset: z.string().optional(),
  authorized: z.boolean().default(false)
});

export interface AutomationResult {
  ok: boolean;
  reason?: string;
}

export async function upsertAutomation(formData: FormData): Promise<AutomationResult> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    triggerType: formData.get("triggerType"),
    triggerTo: formData.get("triggerTo") || undefined,
    triggerOnlyMine: formData.get("triggerOnlyMine") === "on",
    actionType: formData.get("actionType"),
    actionText: formData.get("actionText") ?? "",
    actionTo: formData.get("actionTo") || undefined,
    actionPreset: formData.get("actionPreset") || undefined,
    authorized: formData.get("authorized") === "on"
  });
  if (!parsed.success) return { ok: false, reason: "Faltan datos o no son válidos." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "No autenticado" };

  const d = parsed.data;

  // `Json` y no `unknown`: es lo que acepta la columna jsonb en los tipos
  // generados, y con `unknown` el insert no compila.
  const triggerParams: Record<string, Json> = {};
  if (d.triggerType === "task.status_changed" && d.triggerTo) triggerParams.to = d.triggerTo;
  if (d.triggerType === "task.assigned" && d.triggerOnlyMine) triggerParams.soloAMi = true;
  if (d.triggerType === "comment.added" && d.triggerOnlyMine) triggerParams.soloMenciones = true;

  const actionParams: Record<string, Json> = {};
  if (d.actionType === "create_task") actionParams.title = d.actionText;
  if (d.actionType === "log_entry") actionParams.text = d.actionText;
  if (d.actionType === "set_status") actionParams.to = d.actionTo ?? "";
  if (d.actionType === "create_reminder") {
    actionParams.preset = d.actionPreset ?? "manana";
    actionParams.text = d.actionText;
  }

  const { error } = await supabase.from("automations").insert({
    user_id: user.id,
    name: d.name,
    trigger_type: d.triggerType as TriggerType,
    trigger_params: triggerParams,
    action_type: d.actionType as ActionType,
    action_params: actionParams,
    // Una acción sin impacto no necesita permiso, así que se guarda autorizada
    // aunque la casilla venga apagada: pedirlo sería pedir un permiso para algo
    // que no lo requiere (FR-AUT-002).
    authorized: isImpactAction(d.actionType as ActionType) ? d.authorized : true,
    enabled: true
  });
  if (error) return { ok: false, reason: error.message };

  await supabase.from("audit_log").insert({ user_id: user.id, action: "automation.create", object: d.name });
  revalidatePath("/settings");
  return { ok: true };
}

export async function toggleAutomation(id: string, enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("automations").update({ enabled }).eq("id", id).eq("user_id", user.id);
  revalidatePath("/settings");
}

export async function deleteAutomation(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("automations").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/settings");
}
