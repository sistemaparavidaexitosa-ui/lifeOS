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
import { useState, useTransition } from "react";
import { inviteMember, type InviteResult } from "./actions";

export default function InviteMemberForm({ workspaceId }: { workspaceId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles (http, Safari sin gesto): el enlace ya
      // está visible y seleccionable en pantalla.
    }
  }

  return (
    <div className="flex flex-col gap-2 mt-3">
      <form
        action={(fd) =>
          startTransition(async () => {
            setError(null);
            try {
              const invite = await inviteMember(fd);
              setResult(invite);
            } catch (e) {
              setResult(null);
              setError(e instanceof Error ? e.message : "No se pudo crear la invitación");
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

      {result && (
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
          <code
            className="text-xs"
            style={{ wordBreak: "break-all", background: "var(--surface2)", padding: "6px 8px", borderRadius: 8 }}
          >
            {result.inviteUrl}
          </code>
          <button type="button" className="btn-ghost btn-sm" onClick={() => copyLink(result.inviteUrl)} style={{ alignSelf: "flex-start" }}>
            {copied ? "✓ Copiado" : "Copiar enlace"}
          </button>
        </div>
      )}
    </div>
  );
}
