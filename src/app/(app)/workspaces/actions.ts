"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** FR-WSP-001: crea el workspace y la membresía Owner del creador. */
export async function createWorkspace(name: string) {
  if (!name.trim()) throw new Error("Nombre requerido");
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();

  const { data: ws, error } = await supabase.from("workspaces").insert({ owner_id: user.id, name: name.trim() }).select().single();
  if (error || !ws) throw new Error(error?.message ?? "No se pudo crear");

  await supabase.from("memberships").insert({ workspace_id: ws.id, user_id: user.id, user_name: profile?.name ?? "Owner", role: "Owner", status: "Active" });
  await supabase.from("audit_log").insert({ user_id: user.id, action: "workspace.create", object: ws.id });
  revalidatePath("/workspaces");
  return ws.id as string;
}

const inviteSchema = z.object({
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["Admin", "Member", "Guest", "Viewer"])
});

/** FR-WSP-003, BR-013: token de un solo uso con expiración (7 días, definido en el DEFAULT de la columna). */
export async function inviteMember(formData: FormData) {
  const parsed = inviteSchema.parse({
    workspaceId: formData.get("workspaceId"),
    email: formData.get("email"),
    role: formData.get("role")
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("invitations").insert({ workspace_id: parsed.workspaceId, email: parsed.email, role: parsed.role });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "invite.send", object: parsed.email });
  revalidatePath("/workspaces");
}

export async function removeMember(membershipId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("memberships").delete().eq("id", membershipId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "member.remove", object: membershipId });
  revalidatePath("/workspaces");
}

export async function deleteWorkspace(workspaceId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  await supabase.from("projects").update({ workspace_id: null }).eq("workspace_id", workspaceId);
  const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "workspace.delete", object: workspaceId });
  revalidatePath("/workspaces");
  revalidatePath("/execution");
}

export async function shareProject(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const workspaceId = String(formData.get("workspaceId"));
  const accessLevel = String(formData.get("accessLevel"));

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  await supabase.from("projects").update({ workspace_id: workspaceId }).eq("id", projectId);
  const { error } = await supabase.from("project_shares").upsert({ project_id: projectId, workspace_id: workspaceId, access_level: accessLevel }, { onConflict: "project_id" });
  if (error) throw new Error(error.message);

  await supabase.from("workspace_activity").insert({ workspace_id: workspaceId, project_id: projectId, type: "share", text: `Proyecto compartido (${accessLevel})`, actor: user.email ?? "" });
  revalidatePath("/workspaces");
  revalidatePath("/execution");
}
