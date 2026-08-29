import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/email/send";
import { ROLES_QUE_ADMINISTRAN, type WorkspaceSummary } from "@/lib/data/workspaces";
import TeamPanel, { type TeamInvitation, type TeamMember } from "./TeamPanel";

/**
 * Carga el equipo del espacio activo (miembros + invitaciones) y lo entrega al
 * panel lateral.
 *
 * Server Component propio, y no parte de la página, por dos razones: Next puede
 * hacer streaming del contenido sin esperar a estas dos consultas —el usuario
 * casi siempre viene a trabajar, no a administrar el equipo— y así lo comparten
 * las dos pantallas del espacio (/execution y /notebooks) sin duplicar la carga.
 *
 * El roster completo sale del RPC `list_workspace_members`, NO de un
 * `select * from memberships`: desde el fix 0012 esa tabla solo expone, por
 * SELECT directo, la fila propia del usuario (para eliminar el riesgo de
 * recursión de RLS).
 */
export default async function TeamSection({
  workspace,
  userId,
  projectCount
}: {
  workspace: WorkspaceSummary;
  userId: string;
  /** Proyectos dentro del espacio: el aviso de borrado tiene que decirlo. */
  projectCount: number;
}) {
  const supabase = await createClient();

  const [{ data: memberRows }, { data: invitationRows }] = await Promise.all([
    supabase.rpc("list_workspace_members", { p_workspace_id: workspace.id }),
    // RLS (invitations_all_admin) ya limita esto a Owner/Admin: para un Member
    // la consulta vuelve vacía y el panel simplemente no pinta la sección.
    supabase.from("invitations").select("id, email, role, token, status, expires_at").eq("workspace_id", workspace.id)
  ]);

  const members: TeamMember[] = ((memberRows ?? []) as { id: string; user_id: string; user_name: string; role: string }[]).map(
    (m) => ({ id: m.id, userId: m.user_id, userName: m.user_name, role: m.role })
  );

  const invitations: TeamInvitation[] = (invitationRows ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    // `status` en la base solo cambia al aceptar/revocar; una Pending vencida
    // seguía mostrándose como Pending y el admin no entendía por qué el
    // invitado no podía entrar. El vencimiento se resuelve aquí, al leer.
    state: i.status === "Pending" && new Date(i.expires_at) < new Date() ? "Expired" : i.status,
    expiresAt: i.expires_at,
    inviteUrl: appUrl(`/invite/${i.token}`)
  }));

  return (
    <TeamPanel
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      members={members}
      invitations={invitations}
      currentUserId={userId}
      canManage={ROLES_QUE_ADMINISTRAN.includes(workspace.role)}
      canDelete={workspace.role === "Owner"}
      projectCount={projectCount}
    />
  );
}
