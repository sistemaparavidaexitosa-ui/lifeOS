import "server-only";

/**
 * Plantillas de correo. HTML deliberadamente simple y con estilos en línea:
 * los clientes de correo ignoran hojas de estilo externas y `<style>` en
 * `<head>` es inconsistente. Siempre se acompaña de una versión de texto
 * plano (mejora la entregabilidad y sirve en clientes sin HTML).
 */
export interface InvitationEmailInput {
  workspaceName: string;
  role: string;
  inviterName: string;
  acceptUrl: string;
  expiresAt: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function invitationEmail(input: InvitationEmailInput): { subject: string; html: string; text: string } {
  const workspace = escapeHtml(input.workspaceName);
  const inviter = escapeHtml(input.inviterName);
  const role = escapeHtml(input.role);

  const subject = `${input.inviterName} te invitó a "${input.workspaceName}" en LifeOS`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f5fb;padding:28px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7099;">LifeOS</p>
    <h1 style="margin:0 0 14px;font-size:20px;color:#14142b;">Te invitaron a colaborar</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#14142b;">
      <b>${inviter}</b> te invitó al espacio de trabajo <b>${workspace}</b> con el rol <b>${role}</b>.
    </p>
    <p style="margin:0 0 22px;font-size:14px;line-height:1.55;color:#6b7099;">
      Al aceptar podrás ver y trabajar los proyectos y tareas que se compartan en ese espacio.
      Tus finanzas, hábitos y agenda personal siguen siendo privados: nunca se comparten.
    </p>
    <a href="${input.acceptUrl}" style="display:inline-block;background:#6161ff;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px;">
      Aceptar invitación
    </a>
    <p style="margin:22px 0 0;font-size:12.5px;line-height:1.5;color:#6b7099;">
      El enlace vence el ${escapeHtml(input.expiresAt)} y solo puede usarse una vez.
      Debes aceptarla desde la cuenta con esta misma dirección de correo.
    </p>
    <p style="margin:14px 0 0;font-size:12.5px;line-height:1.5;color:#6b7099;word-break:break-all;">
      Si el botón no funciona, copia este enlace:<br />${escapeHtml(input.acceptUrl)}
    </p>
    <p style="margin:20px 0 0;font-size:12px;color:#9aa0c3;">
      ¿No esperabas esta invitación? Ignora este correo, no se creará ninguna cuenta ni acceso.
    </p>
  </div>
</div>`.trim();

  const text = [
    `${input.inviterName} te invitó al espacio de trabajo "${input.workspaceName}" en LifeOS con el rol ${input.role}.`,
    "",
    `Aceptar: ${input.acceptUrl}`,
    "",
    `El enlace vence el ${input.expiresAt} y solo puede usarse una vez.`,
    "Debes aceptarla desde la cuenta con esta misma dirección de correo.",
    "",
    "¿No esperabas esta invitación? Ignora este correo."
  ].join("\n");

  return { subject, html, text };
}
