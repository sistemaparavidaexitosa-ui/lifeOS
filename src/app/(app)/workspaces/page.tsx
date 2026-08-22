import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState } from "@/components/ui";
import { fdate } from "@/lib/format";
import { createWorkspace, removeMember, deleteWorkspace, shareProject, revokeInvitation } from "./actions";
import InviteMemberForm from "./InviteMemberForm";

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const { ws: selectedWs } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: workspaces }, { data: invitations }, { data: myProjects }] = await Promise.all([
    supabase.from("workspaces").select("*").order("created_at"),
    supabase.from("invitations").select("*"),
    supabase.from("projects").select("id, title, workspace_id").is("workspace_id", null)
  ]);

  // Fix 0012: `memberships` ahora solo expone, vía SELECT directo, la fila
  // propia del usuario (para eliminar el riesgo de recursión de RLS). Para
  // el roster completo de cada workspace (necesario para "X miembros" y
  // para administrar el equipo) se usa el RPC list_workspace_members, que
  // SÍ ve todas las filas si el usuario es Owner/Admin/Member de ese
  // workspace — ver supabase/migrations/0012_fix_rls_recursion_structural.sql.
  interface MembershipRow {
    id: string;
    workspace_id: string;
    user_id: string;
    user_name: string;
    role: string;
    status: string;
  }
  const membershipsByWorkspace = new Map<string, MembershipRow[]>();
  for (const w of workspaces ?? []) {
    const { data: members } = await supabase.rpc("list_workspace_members", { p_workspace_id: w.id });
    membershipsByWorkspace.set(w.id, (members ?? []) as MembershipRow[]);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--purple) 9%, var(--surface))", borderLeft: "3px solid var(--purple)" }}>
        Colaboración estilo Monday/ClickUp/Notion, limitada a Execution OS. Money OS (cuentas, inversiones, deuda, Cashback,
        patrimonio, metas y Hogar) es siempre privado y nunca visible para colaboradores (NG-007, BR-012, BR-020). Tampoco se
        comparten tus ocupaciones, rango de actividad, hábitos ni lectura (BR-019, BR-027).
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Espacios de trabajo</h3>
        <form
          action={async (fd) => {
            "use server";
            await createWorkspace(String(fd.get("name")));
          }}
          className="flex gap-2"
        >
          <input name="name" placeholder="Nombre del workspace" required style={{ width: 200 }} />
          <button className="btn-primary btn-sm" type="submit">
            + Crear workspace
          </button>
        </form>
      </div>

      {!workspaces?.length ? (
        <Card>
          <EmptyState icon="👥" text="Crea un espacio de trabajo para invitar colaboradores y compartir proyectos." />
        </Card>
      ) : (
        <div className="grid md:grid-cols-3 gap-3.5">
          {workspaces.map((w) => {
            const members = membershipsByWorkspace.get(w.id) ?? [];
            const myRole = w.owner_id === user.id ? "Owner" : members.find((m) => m.user_id === user.id)?.role ?? null;
            return (
              <a key={w.id} href={`/workspaces?ws=${w.id}`} className="card block" style={selectedWs === w.id ? { outline: "2px solid var(--accent)" } : undefined}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6.5 h-6.5 rounded-full grid place-items-center text-white text-xs font-bold" style={{ width: 26, height: 26, background: w.color }}>
                      {w.name.slice(0, 2).toUpperCase()}
                    </span>
                    <b>{w.name}</b>
                  </div>
                  <Chip kind="purple">{myRole}</Chip>
                </div>
                <div className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                  {members.length} miembros
                </div>
              </a>
            );
          })}
        </div>
      )}

      {selectedWs &&
        (() => {
          const ws = workspaces?.find((w) => w.id === selectedWs);
          if (!ws) return <Card><EmptyState icon="❓" text="Workspace no encontrado." /></Card>;
          const members = membershipsByWorkspace.get(ws.id) ?? [];
          const canManage = ws.owner_id === user.id || members.find((m) => m.user_id === user.id)?.role === "Admin";
          const wsInvitations = (invitations ?? []).filter((i) => i.workspace_id === ws.id);

          return (
            <Card>
              <div className="flex items-center justify-between">
                <h3 className="font-bold">◇ {ws.name}</h3>
                {canManage && (
                  <form action={async () => { "use server"; await deleteWorkspace(ws.id); }}>
                    <button className="btn-danger btn-sm" type="submit">
                      Eliminar
                    </button>
                  </form>
                )}
              </div>

              <h4 className="font-bold mt-3 mb-1 text-sm">Miembros</h4>
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--line)" }}>
                  <div>
                    <b className="text-sm">{m.user_name}</b> {m.user_id === user.id && <Chip>tú</Chip>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip kind="purple">{m.role}</Chip>
                    {canManage && m.role !== "Owner" && (
                      <form action={async () => { "use server"; await removeMember(m.id); }}>
                        <button className="btn-ghost btn-sm" type="submit">
                          Expulsar
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}

              {canManage && <InviteMemberForm workspaceId={ws.id} />}

              {wsInvitations.length > 0 && (
                <>
                  <h4 className="font-bold mt-3 mb-1 text-sm">Invitaciones</h4>
                  {wsInvitations.map((i) => {
                    // `status` en la base solo cambia al aceptar/revocar; una
                    // Pending vencida seguía mostrándose como Pending y el
                    // admin no entendía por qué el invitado no podía entrar.
                    const expired = i.status === "Pending" && new Date(i.expires_at) < new Date();
                    const state = expired ? "Expired" : i.status;
                    return (
                      <div key={i.id} className="flex items-center justify-between py-2 text-sm flex-wrap gap-2" style={{ borderBottom: "1px solid var(--line)" }}>
                        <span>{i.email}</span>
                        <div className="flex items-center gap-2">
                          <span style={{ color: "var(--muted)" }}>
                            {i.role} · {expired ? "venció" : "expira"} {fdate(i.expires_at)}
                          </span>
                          <Chip kind={state === "Accepted" ? "ok" : state === "Pending" ? "warn" : ""}>{state}</Chip>
                          {canManage && i.status === "Pending" && (
                            <form action={async () => { "use server"; await revokeInvitation(i.id); }}>
                              <button className="btn-ghost btn-sm" type="submit">
                                Cancelar
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {myProjects && myProjects.length > 0 && (
                <>
                  <h4 className="font-bold mt-3 mb-1 text-sm">Compartir un proyecto personal</h4>
                  <form action={shareProject} className="flex gap-2 flex-wrap">
                    <input type="hidden" name="workspaceId" value={ws.id} />
                    <select name="projectId">
                      {myProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                    <select name="accessLevel" defaultValue="edit">
                      <option value="view">view</option>
                      <option value="comment">comment</option>
                      <option value="edit">edit</option>
                    </select>
                    <button className="btn-primary btn-sm" type="submit">
                      Compartir
                    </button>
                  </form>
                </>
              )}

              <div className="text-xs p-2.5 rounded-r-xl mt-3" style={{ background: "color-mix(in srgb, var(--purple) 9%, var(--surface))", borderLeft: "3px solid var(--purple)" }}>
                Ningún rol de este workspace puede ver tu Money OS, tu Hogar, tus hábitos/lectura ni tu planeación personal
                (Hoy, ocupaciones, rango de actividad).
              </div>
            </Card>
          );
        })()}
    </div>
  );
}
