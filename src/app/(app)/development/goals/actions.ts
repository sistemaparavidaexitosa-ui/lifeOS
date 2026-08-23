// src/app/(app)/development/goals/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const goalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  area: z.enum(["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"]),
  horizon: z.string().optional().or(z.literal("")),
  status: z.enum(["Activa", "Pausada", "Lograda", "Abandonada"])
});

export async function upsertPersonalGoal(id: string | null, formData: FormData) {
  const parsed = goalSchema.parse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    area: formData.get("area"),
    horizon: formData.get("horizon") ?? "",
    status: formData.get("status") ?? "Activa"
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    title: parsed.title,
    description: parsed.description,
    area: parsed.area,
    horizon: parsed.horizon || null,
    status: parsed.status,
    achieved_at: parsed.status === "Lograda" ? new Date().toISOString() : null
  };

  if (id) {
    const { error } = await supabase.from("personal_goals").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("personal_goals").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }

  await supabase.from("audit_log").insert({ user_id: user.id, action: "personal_goal.upsert", object: id ?? "" });
  revalidatePath("/development/goals");
  revalidatePath("/development");
}

export async function deletePersonalGoal(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("personal_goals").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/goals");
  revalidatePath("/development");
}

const krSchema = z.object({
  title: z.string().min(1),
  sourceKind: z.enum(["habit", "project", "book", "financial_goal", "manual"]),
  sourceId: z.string().uuid().optional().or(z.literal("")),
  target: z.coerce.number().min(0).default(0),
  manualCurrent: z.coerce.number().min(0).default(0),
  unit: z.string().optional().default("")
});

export async function upsertKeyResult(goalId: string, id: string | null, formData: FormData) {
  const parsed = krSchema.parse({
    title: formData.get("title"),
    sourceKind: formData.get("sourceKind"),
    sourceId: formData.get("sourceId") ?? "",
    target: formData.get("target") ?? 0,
    manualCurrent: formData.get("manualCurrent") ?? 0,
    unit: formData.get("unit") ?? ""
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const sourceId = parsed.sourceKind === "manual" ? null : parsed.sourceId || null;
  if (parsed.sourceKind !== "manual" && !sourceId) throw new Error("Elige la fuente que va a medir este resultado clave.");

  // BR-012: solo proyectos PERSONALES pueden medir un resultado clave. Se
  // resuelve en el servidor consultando projects.workspace_id, nunca
  // confiando en un parámetro del cliente.
  if (parsed.sourceKind === "project" && sourceId) {
    const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", sourceId).single();
    if (project?.workspace_id) throw new Error("Un resultado clave solo puede medirse contra un proyecto personal, no contra uno de un workspace.");
  }

  const payload = {
    title: parsed.title,
    source_kind: parsed.sourceKind,
    source_id: sourceId,
    target: parsed.target,
    manual_current: parsed.manualCurrent,
    unit: parsed.unit
  };

  if (id) {
    const { error } = await supabase.from("key_results").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("key_results").insert({ ...payload, goal_id: goalId });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/development/goals");
  revalidatePath("/development");
}

export async function deleteKeyResult(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("key_results").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/goals");
  revalidatePath("/development");
}
