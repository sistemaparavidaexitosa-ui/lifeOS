"use server";

// Acciones de espacios de trabajo. Vivían en src/app/(app)/workspaces/actions.ts,
// junto a una pantalla propia colgada del menú lateral. Desde el rediseño de
// 0030/0031 los workspaces dejaron de ser un módulo aparte: son EL CONTENEDOR
// de los proyectos (todo proyecto vive en uno), así que su administración se
// hace desde la misma pantalla donde están los proyectos — /execution.
//
// Contrato de todas las acciones de este archivo: `{ ok, reason }` en vez de
// lanzar (D-030). El panel de Equipo es un Client Component y necesita pintar
// el motivo; en producción Next redacta el mensaje de una excepción y el
// usuario solo vería una pared opaca. Varias de las reglas nuevas viven en
// triggers de la base (espacio personal intocable, workspace con proyectos no
// se borra) y su `raise exception` llega hasta aquí como texto legible.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, appUrl } from "@/lib/email/send";
import { invitationEmail } from "@/lib/email/templates";
import { fdate } from "@/lib/format";
import { describeDbError, type ActionResult } from "@/lib/supabase/errors";

/** FR-WSP-001: crea el workspace y la membresía Owner del creador. */
export async function createWorkspace(name: string): Promise<ActionResult & { id?: string }> {
  if (!name.trim()) return { ok: false, reason: "Ponle un nombre al espacio." };
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();

  // is_personal se deja en su DEFAULT (false) a propósito: el espacio personal
  // lo crea el trigger de alta (0030), es único por usuario y no se fabrica
  // desde la app.
  const { data: ws, error } = await supabase
    .from("workspaces")
    .insert({ owner_id: user.id, name: name.trim() })
    .select("id")
    .single();
  if (error || !ws) return { ok: false, reason: describeDbError(error) };

  const { error: membershipError } = await supabase.from("memberships").insert({
    workspace_id: ws.id,
    user_id: user.id,
    user_name: profile?.name ?? "Owner",
    role: "Owner",
    status: "Active"
  });
  // Sin la membresía el espacio sería inalcanzable para su propio dueño en
  // cuanto una consulta filtre por memberships, así que no se puede tragar.
  if (membershipError) return { ok: false, reason: describeDbError(membershipError) };

  await supabase.from("audit_log").insert({ user_id: user.id, action: "workspace.create", object: ws.id });
  revalidatePath("/execution");
  return { ok: true, id: ws.id as string };
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
 *
 * Invitar al espacio PERSONAL lo rechaza un trigger de la base (0030), no
 * solo la interfaz: ese espacio es la frontera de privacidad sobre la que
 * descansa BR-012 y no puede depender de que la UI esconda un botón.
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
  revalidatePath("/execution");

  return { ok: true, inviteUrl, emailSent: delivery.sent, emailError: delivery.reason, email };
}

/** Cancela una invitación pendiente: el enlace deja de servir de inmediato. */
export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  // RLS (invitations_all_admin) ya limita esto a Owner/Admin del workspace.
  const { error } = await supabase.from("invitations").update({ status: "Revoked" }).eq("id", invitationId);
  if (error) return { ok: false, reason: describeDbError(error) };

  await supabase.from("audit_log").insert({ user_id: user.id, action: "invite.revoke", object: invitationId });
  revalidatePath("/execution");
  return { ok: true };
}

export async function removeMember(membershipId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { error } = await supabase.from("memberships").delete().eq("id", membershipId);
  if (error) return { ok: false, reason: describeDbError(error) };

  await supabase.from("audit_log").insert({ user_id: user.id, action: "member.remove", object: membershipId });
  revalidatePath("/execution");
  return { ok: true };
}

/**
 * Elimina un espacio de trabajo VACÍO.
 *
 * Antes esto hacía `update projects set workspace_id = null` y borraba el
 * workspace: los proyectos quedaban huérfanos, en un limbo que la interfaz
 * llamaba "personal". Esa salida ya no existe — workspace_id es NOT NULL desde
 * 0030 — así que el borrado se bloquea mientras quede trabajo dentro, y el
 * mensaje dice cuánto.
 *
 * La comprobación se hace aquí para poder contar los proyectos y nombrarlos en
 * el mensaje, pero la regla de verdad vive en el trigger guard_workspace_delete
 * (0030): sin él, bastaría llamar al endpoint sin pasar por esta función.
 */
export async function deleteWorkspace(workspaceId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, is_personal")
    .eq("id", workspaceId)
    .single();
  if (wsError) return { ok: false, reason: describeDbError(wsError) };
  if (!workspace) return { ok: false, reason: "Ese espacio ya no existe." };
  if (workspace.is_personal) return { ok: false, reason: "Tu espacio personal no se puede eliminar." };

  const { count, error: countError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (countError) return { ok: false, reason: describeDbError(countError) };
  if (count && count > 0) {
    return {
      ok: false,
      reason: `«${workspace.name}» todavía tiene ${count} proyecto${count === 1 ? "" : "s"}. Muévelos a otro espacio o bórralos antes de eliminarlo.`
    };
  }

  const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId);
  if (error) return { ok: false, reason: describeDbError(error) };

  await supabase.from("audit_log").insert({ user_id: user.id, action: "workspace.delete", object: workspaceId });
  revalidatePath("/execution");
  return { ok: true };
}

/**
 * Mueve un proyecto de un espacio a otro.
 *
 * Es el sustituto de la vieja `shareProject`. Aquella hacía dos cosas a la vez
 * —le ponía workspace_id al proyecto Y creaba la fila de project_shares—
 * porque sin ambas un Member no veía nada. Desde 0031 la membresía basta, así
 * que compartir se volvió simplemente "cambiarlo de espacio".
 *
 * La autorización no la decide esta función: `projects_update_edit` (0031)
 * evalúa su WITH CHECK sobre la fila NUEVA, así que la base rechaza mover un
 * proyecto a un espacio donde no puedas escribir.
 */
export async function moveProject(projectId: string, workspaceId: string): Promise<ActionResult> {
  const parsed = z.object({ projectId: z.string().uuid(), workspaceId: z.string().uuid() }).safeParse({ projectId, workspaceId });
  if (!parsed.success) return { ok: false, reason: "Proyecto o espacio inválido." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { error } = await supabase
    .from("projects")
    .update({ workspace_id: parsed.data.workspaceId })
    .eq("id", parsed.data.projectId);
  if (error) return { ok: false, reason: describeDbError(error) };

  // El share de Guest era para el espacio ANTERIOR: si el proyecto se muda,
  // dejarlo vivo le daría acceso a un invitado que ya no pinta nada ahí.
  await supabase.from("project_shares").delete().eq("project_id", parsed.data.projectId);

  const { data: workspace } = await supabase.from("workspaces").select("is_personal").eq("id", parsed.data.workspaceId).single();
  if (workspace && !workspace.is_personal) {
    await supabase.from("workspace_activity").insert({
      workspace_id: parsed.data.workspaceId,
      project_id: parsed.data.projectId,
      type: "move",
      text: "Proyecto movido a este espacio",
      actor: user.email ?? ""
    });
  }

  await supabase.from("audit_log").insert({ user_id: user.id, action: "project.move", object: parsed.data.projectId });
  revalidatePath("/execution");
  return { ok: true };
}

/**
 * Da (o quita) acceso de un GUEST a un proyecto concreto del espacio.
 *
 * project_shares no se eliminó con el rediseño: cambió de trabajo. Owner,
 * Admin, Member y Viewer ven todos los proyectos del espacio por membresía; el
 * Guest es el colaborador externo, y solo ve aquellos con una fila aquí
 * (0031). `access_level = 'edit'` además lo deja escribir.
 */
export async function shareProjectWithGuest(formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({
      projectId: z.string().uuid(),
      accessLevel: z.enum(["view", "comment", "edit"])
    })
    .safeParse({ projectId: formData.get("projectId"), accessLevel: formData.get("accessLevel") });
  if (!parsed.success) return { ok: false, reason: "Proyecto o nivel de acceso inválido." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", parsed.data.projectId)
    .single();
  if (projectError) return { ok: false, reason: describeDbError(projectError) };
  if (!project) return { ok: false, reason: "Ese proyecto ya no existe." };

  const { error } = await supabase
    .from("project_shares")
    .upsert(
      { project_id: parsed.data.projectId, workspace_id: project.workspace_id, access_level: parsed.data.accessLevel },
      { onConflict: "project_id" }
    );
  if (error) return { ok: false, reason: describeDbError(error) };

  await supabase.from("workspace_activity").insert({
    workspace_id: project.workspace_id,
    project_id: parsed.data.projectId,
    type: "share",
    text: `Proyecto abierto a invitados (${parsed.data.accessLevel})`,
    actor: user.email ?? ""
  });
  revalidatePath("/execution");
  return { ok: true };
}

/** Cierra a los invitados el acceso a un proyecto (borra su fila de project_shares). */
export async function unshareProjectFromGuests(projectId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(projectId);
  if (!parsed.success) return { ok: false, reason: "Proyecto inválido." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { error } = await supabase.from("project_shares").delete().eq("project_id", parsed.data);
  if (error) return { ok: false, reason: describeDbError(error) };

  revalidatePath("/execution");
  return { ok: true };
}
