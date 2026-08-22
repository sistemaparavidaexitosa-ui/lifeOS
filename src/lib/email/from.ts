// Normalización del remitente (EMAIL_FROM). Módulo puro y sin "server-only"
// para poder probarlo con `node --test` — ver tests/domain/email-from.test.ts.
//
// Existe por un error de dedo real y frecuente: en un archivo `.env` se
// escribe EMAIL_FROM="LifeOS <no-reply@dominio.com>" y las comillas son
// sintaxis de shell, pero al pegar ese mismo valor en el panel de Vercel las
// comillas se guardan LITERALES. Resend entonces responde
// `422 Invalid \`from\` field` y el correo nunca sale.

export const DEFAULT_FROM = "LifeOS <onboarding@resend.dev>";

const PLAIN_EMAIL = /^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$/;
const NAMED_EMAIL = /^[^<>]+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/;

/**
 * Devuelve un remitente que Resend acepte: `correo@dominio.com` o
 * `Nombre <correo@dominio.com>`. Quita comillas envolventes y espacios
 * sobrantes; si aun así el valor no tiene forma de correo, usa el default en
 * vez de mandar algo que el proveedor va a rechazar igual.
 */
export function normalizeFrom(raw: string | undefined | null): string {
  const cleaned = (raw ?? "")
    .trim()
    .replace(/^["'](.*)["']$/s, "$1")
    .trim();
  if (!cleaned) return DEFAULT_FROM;
  return PLAIN_EMAIL.test(cleaned) || NAMED_EMAIL.test(cleaned) ? cleaned : DEFAULT_FROM;
}
