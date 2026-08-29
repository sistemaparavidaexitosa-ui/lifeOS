"use client";
// Panel "Equipo": miembros, invitaciones y borrado del espacio activo.
//
// Es lo que queda de la pantalla /workspaces, ahora como Drawer lateral sobre
// la cartera — el mismo patrón (.td-*) que el detalle de tarea y el menú "⋯"
// del proyecto. Administrar el equipo es algo que se hace mirando los
// proyectos, no navegando a otra sección y volviendo.
//
// No se muestra en el espacio personal: ahí no hay a quién invitar (la propia
// base lo rechaza, ver guard_personal_workspace_invitation en 0030) y ofrecer
// el botón solo serviría para enseñar un error.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui";
import { IconClose } from "@/components/icons";
import { fdate } from "@/lib/format";
import InviteMemberForm from "./InviteMemberForm";
import InviteLink from "./InviteLink";
import { deleteWorkspace, removeMember, revokeInvitation } from "./workspace-actions";

export interface TeamMember {
  id: string;
  userId: string;
  userName: string;
  role: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  /** Estado ya resuelto en el servidor: una Pending vencida llega como "Expired". */
  state: string;
  expiresAt: string;
  inviteUrl: string;
}

export default function TeamPanel({
  workspaceId,
  workspaceName,
  members,
  invitations,
  currentUserId,
  canManage,
  canDelete,
  projectCount
}: {
  workspaceId: string;
  workspaceName: string;
  members: TeamMember[];
  invitations: TeamInvitation[];
  currentUserId: string;
  /** Owner/Admin: invitar y expulsar. */
  canManage: boolean;
  /** Solo el Owner puede eliminar el espacio. */
  canDelete: boolean;
  /** Cuántos proyectos hay dentro: el aviso de borrado tiene que decirlo. */
  projectCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; reason?: string }>) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(result.reason ?? "No se pudo completar la acción.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Equipo ({members.length})
      </button>

      {open && (
        <>
          <div className="td-backdrop" onClick={() => setOpen(false)} />
          <aside className="td-drawer" role="dialog" aria-modal="true" aria-label={`Equipo de ${workspaceName}`}>
            <div className="td-drawer-header">
              <b className="td-drawer-title">Equipo · {workspaceName}</b>
              <button type="button" className="td-drawer-close" onClick={() => setOpen(false)} aria-label="Cerrar">
                <IconClose />
              </button>
            </div>

            <div className="td-drawer-body flex flex-col gap-3">
              {error && (
                <div className="ex-alert" role="alert">
                  {error}
                </div>
              )}

              <section>
                <h4 className="font-bold mb-1 text-sm">Miembros</h4>
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-2 gap-2"
                    style={{ borderBottom: "1px solid var(--line)" }}
                  >
                    <div style={{ overflowWrap: "anywhere" }}>
                      <b className="text-sm">{m.userName}</b> {m.userId === currentUserId && <Chip>tú</Chip>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Chip kind="purple">{m.role}</Chip>
                      {canManage && m.role !== "Owner" && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() => run(() => removeMember(m.id))}
                        >
                          Expulsar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </section>

              {canManage && (
                <section>
                  <h4 className="font-bold mb-1 text-sm">Invitar</h4>
                  <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>
                    Quien acepte verá <b>todos los proyectos de este espacio</b>. La única excepción es el rol{" "}
                    <b>Guest</b>: solo alcanza los proyectos que le abras uno por uno.
                  </p>
                  <InviteMemberForm workspaceId={workspaceId} />
                </section>
              )}

              {invitations.length > 0 && (
                <section>
                  <h4 className="font-bold mb-1 text-sm">Invitaciones</h4>
                  {invitations.map((i) => (
                    <div
                      key={i.id}
                      className="py-2 text-sm flex flex-col gap-1.5"
                      style={{ borderBottom: "1px solid var(--line)" }}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span style={{ overflowWrap: "anywhere" }}>{i.email}</span>
                        <div className="flex items-center gap-2">
                          <span style={{ color: "var(--muted)" }}>
                            {i.role} · {i.state === "Expired" ? "venció" : "expira"} {fdate(i.expiresAt)}
                          </span>
                          <Chip kind={i.state === "Accepted" ? "ok" : i.state === "Pending" ? "warn" : ""}>{i.state}</Chip>
                          {canManage && i.state === "Pending" && (
                            <button
                              type="button"
                              className="btn-ghost btn-sm"
                              disabled={pending}
                              onClick={() => run(() => revokeInvitation(i.id))}
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                      {/* El enlace se arma en el servidor con el token que ya
                          está en la base: es la vía FIABLE de recuperarlo. El
                          recuadro que sale justo después de invitar vive en
                          estado de cliente y se pierde con cualquier recarga.
                          Solo para las pendientes vigentes: una vencida o
                          aceptada ya no sirve. */}
                      {canManage && i.state === "Pending" && <InviteLink url={i.inviteUrl} />}
                    </div>
                  ))}
                </section>
              )}

              {canDelete && (
                <section className="mt-2">
                  <h4 className="font-bold mb-1 text-sm">Eliminar espacio</h4>
                  {projectCount > 0 ? (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      No se puede: «{workspaceName}» todavía tiene <b>{projectCount}</b> proyecto
                      {projectCount === 1 ? "" : "s"}. Muévelos a otro espacio o bórralos primero. Antes, eliminar el
                      espacio dejaba sus proyectos sin dueño visible; ahora eso ya no es posible.
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="btn-danger btn-sm"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(`¿Eliminar el espacio "${workspaceName}"? Está vacío, pero perderás su equipo e invitaciones.`)) return;
                        run(async () => {
                          const result = await deleteWorkspace(workspaceId);
                          if (result.ok) router.push("/execution");
                          return result;
                        });
                      }}
                    >
                      Eliminar «{workspaceName}»
                    </button>
                  )}
                </section>
              )}

              <div
                className="text-xs p-2.5 rounded-r-xl"
                style={{
                  background: "color-mix(in srgb, var(--purple) 9%, var(--surface))",
                  borderLeft: "3px solid var(--purple)"
                }}
              >
                Ningún rol de este espacio puede ver tu Money OS, tu Hogar, tus hábitos/lectura ni tu planeación
                personal (Hoy, ocupaciones, rango de actividad). Tu espacio personal tampoco admite invitados.
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
