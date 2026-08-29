"use client";
// Formulario de invitación. Es Client Component porque necesita MOSTRAR el
// resultado: antes era un `<form action={inviteMember}>` que guardaba la fila
// y no decía nada — el admin quedaba creyendo que se había enviado un correo
// que nunca salía.
//
// Ahora siempre se muestra el enlace de invitación, y se distingue con
// claridad si el correo salió o no. Sin proveedor configurado
// (RESEND_API_KEY), invitar sigue siendo útil: copias el enlace y lo mandas
// por donde quieras.
//
// Este recuadro es una COMODIDAD, no la única vía al enlace: vive en estado
// de cliente y cualquier cosa que remonte el componente lo borra. El enlace
// de cada invitación pendiente se pinta también desde el servidor en la lista
// de abajo (page.tsx), que se arma con el token que ya está en la base.
import { useState, useTransition } from "react";
import { inviteMember, type InviteResult } from "./workspace-actions";
import InviteLink from "./InviteLink";

export default function InviteMemberForm({ workspaceId }: { workspaceId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 mt-3">
      <form
        action={(fd) =>
          startTransition(async () => {
            setError(null);
            try {
              const invite = await inviteMember(fd);
              // La acción ya no lanza: devuelve el motivo legible (D-030).
              if (!invite.ok) {
                setResult(null);
                setError(invite.reason);
                return;
              }
              setResult(invite);
            } catch {
              // Solo queda lo que sigue siendo excepción de verdad: que la
              // petición ni siquiera llegue al servidor.
              setResult(null);
              setError("No se pudo contactar al servidor. Revisa tu conexión.");
            }
          })
        }
        className="flex gap-2 flex-wrap"
      >
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input name="email" type="email" placeholder="colega@empresa.com" required style={{ flex: 1, minWidth: 180 }} />
        <select name="role" defaultValue="Member">
          <option>Member</option>
          <option>Admin</option>
          <option>Guest</option>
          <option>Viewer</option>
        </select>
        <button className="btn-primary btn-sm" type="submit" disabled={pending}>
          {pending ? "Invitando…" : "Invitar"}
        </button>
      </form>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {result?.ok && (
        <div
          className="text-sm p-2.5 rounded-xl flex flex-col gap-1.5"
          style={{
            background: result.emailSent ? "var(--st-done-bg)" : "var(--st-working-bg)",
            border: "1px solid var(--line)"
          }}
        >
          <b>
            {result.emailSent
              ? `Invitación enviada a ${result.email}`
              : `Invitación creada para ${result.email} — el correo NO se envió`}
          </b>
          {!result.emailSent && result.emailError && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {result.emailError}
            </span>
          )}
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Enlace (vence en 7 días, un solo uso):
          </span>
          <InviteLink url={result.inviteUrl} />
        </div>
      )}

    </div>
  );
}
