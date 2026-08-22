// Pantalla pública de invitación (/invite/[token]).
//
// Es PÚBLICA a propósito: el invitado normalmente todavía no tiene cuenta, y
// el middleware manda a /login a cualquiera sin sesión. Si esta ruta viviera
// bajo (app), el enlace del correo terminaría siempre en el login sin decir
// qué se estaba aceptando, y al iniciar sesión se perdería el token.
//
// El preview (nombre del workspace, rol, vigencia) sale del RPC
// invitation_preview, que expone SOLO eso — quien reenvíe el enlace no puede
// enumerar miembros ni ver el correo invitado completo.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { fdate } from "@/lib/format";
import AcceptButton from "./AcceptButton";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const [{ data: previewRows }, { data: auth }] = await Promise.all([
    supabase.rpc("invitation_preview", { p_token: token }),
    supabase.auth.getUser()
  ]);

  const preview = Array.isArray(previewRows) ? previewRows[0] : previewRows;
  const user = auth?.user ?? null;

  if (!preview || preview.state === "NotFound") {
    return (
      <Shell>
        <h1 className="text-lg font-bold">Invitación no encontrada</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          El enlace no es válido. Pídele a quien te invitó que te mande uno nuevo.
        </p>
        <Link href="/login" className="btn-ghost btn-sm">
          Ir a LifeOS
        </Link>
      </Shell>
    );
  }

  if (preview.state !== "Pending") {
    const reason =
      preview.state === "Expired"
        ? "Esta invitación expiró."
        : preview.state === "Accepted"
          ? "Esta invitación ya fue aceptada."
          : preview.state === "Revoked"
            ? "Esta invitación fue cancelada."
            : "Esta invitación ya no está disponible.";
    return (
      <Shell>
        <h1 className="text-lg font-bold">{reason}</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Pídele a un administrador de <b>{preview.workspace_name}</b> que te envíe una nueva.
        </p>
        <Link href="/login" className="btn-ghost btn-sm">
          Ir a LifeOS
        </Link>
      </Shell>
    );
  }

  const nextUrl = `/invite/${token}`;

  return (
    <Shell>
      <p className="text-xs font-extrabold uppercase" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>
        Invitación a un espacio de trabajo
      </p>
      <h1 className="text-xl font-black" style={{ letterSpacing: "-0.02em" }}>
        {preview.workspace_name}
      </h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Te invitaron con el rol <b>{preview.role}</b>. Vence el {fdate(preview.expires_at)} y el enlace sirve una sola vez.
      </p>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Al aceptar verás los proyectos y tareas que se compartan ahí. Tus finanzas, hábitos y agenda personal
        siguen siendo privados y nunca se comparten.
      </p>

      {user ? (
        <>
          <p className="text-sm">
            Sesión iniciada como <b>{user.email}</b>. La invitación es para <b>{preview.email_hint}</b>.
          </p>
          <AcceptButton token={token} />
        </>
      ) : (
        <>
          <p className="text-sm">
            Para aceptarla inicia sesión (o crea tu cuenta) con la dirección <b>{preview.email_hint}</b>.
          </p>
          <Link href={`/login?next=${encodeURIComponent(nextUrl)}`} className="btn-primary">
            Iniciar sesión y aceptar
          </Link>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16 }}>
      <Card className="flex flex-col gap-3" >
        <div style={{ maxWidth: 460, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
      </Card>
    </div>
  );
}
