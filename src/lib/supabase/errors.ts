// Traduce un error de PostgREST/Postgres a un mensaje que el usuario pueda
// leer y que a nosotros nos diga qué hacer.
//
// POR QUÉ EXISTE
// Una Server Action que lanza una excepción produce, en el build de producción
// de Next, este texto y nada más:
//
//   "An error occurred in the Server Components render. The specific message
//    is omitted in production builds to avoid leaking sensitive details."
//
// El usuario ve una pared opaca y nosotros perdemos el diagnóstico. Es
// exactamente lo que ocurrió al guardar un libro cuando `books.cover_url`
// existía en el código y en la base local, pero la migración 0026 no había
// llegado a producción: la acción lanzaba, Next redactaba, y desde la pantalla
// era indistinguible de un fallo de red.
//
// El contrato que se adopta a cambio es el de `sendEmail()` (src/lib/email/
// send.ts, D-021), que el spec del módulo ya defiende en §5.5: la acción NO
// lanza, devuelve `{ ok, reason }`, y `reason` es un texto que se puede pintar.
//
// Esta función es pura a propósito (probada en tests/domain/supabase-errors.test.ts):
// recibe la forma del error, no el cliente de Supabase.

export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
}

/** `column books.cover_url does not exist` → `books.cover_url` */
function columnFromMessage(message: string): string | null {
  const undefined_column = /column ([\w.]+) does not exist/i.exec(message);
  if (undefined_column) return undefined_column[1] ?? null;
  // PGRST204: Could not find the 'cover_url' column of 'books' in the schema cache
  const schema_cache = /find the '([\w]+)' column of '([\w]+)'/i.exec(message);
  if (schema_cache) return `${schema_cache[2]}.${schema_cache[1]}`;
  return null;
}

/**
 * El caso que motivó este archivo. Se distingue del resto porque su causa no
 * es un dato mal capturado sino un despliegue incompleto, y la acción que lo
 * resuelve no la hace el usuario sino quien opera la base.
 */
const MIGRACION_PENDIENTE = new Set(["PGRST204", "42703", "42P01"]);

export function describeDbError(error: DbErrorLike | null | undefined): string {
  if (!error) return "Error desconocido.";
  const code = error.code ?? "";
  const message = error.message ?? "";

  if (MIGRACION_PENDIENTE.has(code)) {
    const columna = columnFromMessage(message);
    const que = columna ? `«${columna}»` : "una columna o tabla";
    return `La base de datos no tiene ${que}: falta aplicar una migración (\`supabase db push\`) o recargar el caché de PostgREST (\`notify pgrst, 'reload schema';\`).`;
  }

  switch (code) {
    case "23505":
      return "Ya existe un registro con esos datos.";
    case "23503":
      return "El elemento al que hace referencia ya no existe.";
    case "23514":
      return "Alguno de los valores no es válido para este campo.";
    case "23502":
      return "Falta un campo obligatorio.";
    case "42501":
      return "No tienes permisos sobre este dato. Puede ser un GRANT o una política RLS faltante.";
    case "PGRST301":
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
    default:
      return message || `Error de base de datos${code ? ` (${code})` : ""}.`;
  }
}

/** Resultado uniforme de las Server Actions que adoptan este contrato. */
export interface ActionResult {
  ok: boolean;
  reason?: string;
}

export const actionOk: ActionResult = { ok: true };

export function actionFailed(error: DbErrorLike | null | undefined): ActionResult {
  return { ok: false, reason: describeDbError(error) };
}
