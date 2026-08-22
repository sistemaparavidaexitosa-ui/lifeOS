import "server-only";
import { publicEnv } from "@/config/env";
import { normalizeFrom } from "./from";

/**
 * Envío de correo transaccional vía Resend, con `fetch` directo a su API REST
 * — sin agregar dependencias (D-008: el set de runtime se mantiene mínimo).
 *
 * REGLA DE ORO DE ESTE MÓDULO: **nunca lanza**. Un proveedor caído o una API
 * key ausente no debe tumbar la acción que lo invoca (invitar a alguien tiene
 * que funcionar aunque el correo no salga: para eso la UI muestra el enlace
 * para copiar). Devuelve siempre un resultado que el llamador debe REPORTAR
 * al usuario — jamás se dice "invitación enviada" si `sent` es false.
 */
export interface EmailResult {
  sent: boolean;
  /** Motivo legible cuando no se envió; útil para mostrarlo en la UI. */
  reason?: string;
  id?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Remitente. Resend exige un dominio verificado: mientras no lo configures,
 * `onboarding@resend.dev` solo entrega a TU propia dirección de registro, así
 * que en producción hay que definir EMAIL_FROM.
 *
 * La normalización (comillas envolventes, espacios, formato) vive en
 * ./from.ts, que es puro y está probado en tests/domain/email-from.test.ts.
 */
function fromAddress(): string {
  return normalizeFrom(process.env.EMAIL_FROM);
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      sent: false,
      reason: "El envío de correo no está configurado (falta RESEND_API_KEY). Comparte el enlace manualmente."
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text
      })
    });

    if (!response.ok) {
      // El cuerpo de error de Resend trae el motivo real (dominio no
      // verificado, destinatario inválido, cuota). Se propaga tal cual a la
      // UI: un "no se pudo enviar" a secas no le sirve a nadie.
      const detail = await response.text();
      const hint = detail.includes("`from`")
        ? " — revisa EMAIL_FROM en las variables de entorno: debe ser `Nombre <correo@dominio.com>` SIN comillas, y el dominio debe estar verificado en Resend."
        : "";
      return { sent: false, reason: `El proveedor rechazó el envío (${response.status}): ${detail.slice(0, 200)}${hint}` };
    }

    const data = (await response.json()) as { id?: string };
    return { sent: true, id: data.id };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Error de red al enviar el correo" };
  }
}

/** URL absoluta de la app, para construir enlaces que van por correo. */
export function appUrl(path: string): string {
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
