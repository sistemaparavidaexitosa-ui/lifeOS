"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, appUrl } from "@/lib/email/send";
import { invitationEmail } from "@/lib/email/templates";
import { fdate } from "@/lib/format";
import { describeDbError } from "@/lib/supabase/errors";

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

/**
 * Resultado de invitar. Se devuelve SIEMPRE el enlace: si el correo no salió
 * (sin RESEND_API_KEY, dominio sin verificar, proveedor caído), el admin
 * puede compartirlo a mano en vez de quedarse esperando un correo que nunca
 * llega — que es exactamente lo que pasaba antes, salvo que ni siquiera había
 * enlace: la invitación se guardaba y ahí moría.
 *
 * `ok: false` con un motivo legible en vez de lanzar (D-030, mismo contrato
 * que `sendEmail` y que las acciones de la biblioteca). Antes esto hacía
 * `throw new Error(...)` y en producción Next borraba el mensaje: la
 * respuesta era un 500 con un `digest` y nada más, así que el admin no podía
 * saber por qué no salía el enlace y nosotros tampoco.
 */
export type InviteResult =
  | { ok: true; inviteUrl: string; emailSent: boolean; emailError?: string; email: string }
  | { ok: false; reason: string };

/**
 * FR-WSP-003, BR-013: token de un solo uso con expiración (7 días, DEFAULT de
 * la columna). El token se canjea en /invite/[token] contra el RPC
 * accept_invitation (migración 0022).
 *
 * Si ya existe una invitación Pending para el mismo correo y workspace, se
 * REUTILIZA en vez de crear otra: así el admin puede "reenviar" sin llenar la
 * tabla de tokens vivos para la misma persona.
 */
export async function inviteMember(formData: FormData): Promise<InviteResult> {
  const parsed = inviteSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    email: formData.get("email"),
    role: formData.get("role")
  });
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "Datos de la invitación inválidos." };
  }
  const { workspaceId, role } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: workspace, error: wsError } = await supabase.from("workspaces").select("name").eq("id", workspaceId).single();
  if (wsError) return { ok: false, reason: describeDbError(wsError) };
  if (!workspace) return { ok: false, reason: "Ese workspace ya no existe." };

  const { data: existing } = await supabase
    .from("invitations")
    .select("id, token, expires_at, status")
    .eq("workspace_id", workspaceId)
    .eq("email", email)
    .eq("status", "Pending")
    // maybeSingle() devuelve error si hay MÁS de una pendiente para el mismo
    // correo. Antes eso dejaba `existing` en null y se creaba otra encima,
    // acumulando tokens vivos; ahora se ordena y se toma la más reciente.
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let token = existing?.token;
  let expiresAt = existing?.expires_at;

  if (existing) {
    // Reenvío: refresca la vigencia y el rol ofrecido.
    const renewed = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("invitations")
      .update({ role, expires_at: renewed })
      .eq("id", existing.id);
    if (error) return { ok: false, reason: describeDbError(error) };
    expiresAt = renewed;
  } else {
    const { data: created, error } = await supabase
      .from("invitations")
      .insert({ workspace_id: workspaceId, email, role })
      .select("token, expires_at")
      .single();
    if (error) return { ok: false, reason: describeDbError(error) };
    if (!created?.token) {
      // RLS puede dejar pasar el INSERT y no devolver la fila. Sin token no
      // hay enlace, y decirlo es mejor que devolver uno con "undefined".
      return { ok: false, reason: "La invitación se guardó pero no se pudo leer su token. Revisa las políticas RLS de invitations." };
    }
    token = created.token;
    expiresAt = created.expires_at;
  }

  const inviteUrl = appUrl(`/invite/${token}`);
  const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();

  const template = invitationEmail({
    workspaceName: workspace.name,
    role,
    inviterName: profile?.name || user.email || "Un colega",
    acceptUrl: inviteUrl,
    expiresAt: fdate(expiresAt)
  });
  const delivery = await sendEmail({ to: email, ...template });

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "invite.send",
    object: email,
    meta: { workspaceId, role, emailSent: delivery.sent, reason: delivery.reason ?? null }
  });
  revalidatePath("/workspaces");

  return { ok: true, inviteUrl, emailSent: delivery.sent, emailError: delivery.reason, email };
}

/** Cancela una invitación pendiente: el enlace deja de servir de inmediato. */
export async function revokeInvitation(invitationId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // RLS (invitations_all_admin) ya limita esto a Owner/Admin del workspace.
  const { error } = await supabase.from("invitations").update({ status: "Revoked" }).eq("id", invitationId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "invite.revoke", object: invitationId });
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
