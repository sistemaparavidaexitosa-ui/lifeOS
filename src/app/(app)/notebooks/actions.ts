"use server";

// Acciones de los notebooks del espacio de trabajo.
//
// Contrato `{ ok, reason }` en todas (D-030): en producción Next redacta el
// mensaje de una excepción lanzada desde una Server Action, y aquí hay dos
// fallos que el usuario TIENE que poder leer — el choque de versiones al
// guardar y la falta de permiso de escritura.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { describeDbError, type ActionResult } from "@/lib/supabase/errors";

/**
 * Nombre con el que queda firmada la nota. Se denormaliza en la fila (no se
 * resuelve al leer) para que la marca de autoría sobreviva a la baja de la
 * cuenta — ver el comentario de `notebooks.created_by` en la migración 0032.
 */
async function firmaDelUsuario(): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();
  return { id: user.id, name: profile?.name?.trim() || user.email?.split("@")[0] || "Alguien" };
}

// =============================================================================
// Notebooks
// =============================================================================

export async function createNotebook(workspaceId: string, title: string, icon: string): Promise<ActionResult & { id?: string }> {
  const parsed = z
    .object({ workspaceId: z.string().uuid(), title: z.string().trim().min(1), icon: z.string().trim().min(1).max(8) })
    .safeParse({ workspaceId, title, icon });
  if (!parsed.success) return { ok: false, reason: "Ponle un nombre al cuaderno." };

  const firma = await firmaDelUsuario();
  if (!firma) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notebooks")
    .insert({
      workspace_id: parsed.data.workspaceId,
      title: parsed.data.title,
      icon: parsed.data.icon,
      created_by: firma.id,
      created_by_name: firma.name
    })
    .select("id")
    .single();
  if (error) return { ok: false, reason: describeDbError(error) };

  revalidatePath("/notebooks");
  return { ok: true, id: data.id as string };
}

export async function renameNotebook(notebookId: string, title: string, icon: string): Promise<ActionResult> {
  const parsed = z
    .object({ notebookId: z.string().uuid(), title: z.string().trim().min(1), icon: z.string().trim().min(1).max(8) })
    .safeParse({ notebookId, title, icon });
  if (!parsed.success) return { ok: false, reason: "El cuaderno necesita un nombre." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notebooks")
    .update({ title: parsed.data.title, icon: parsed.data.icon, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.notebookId);
  if (error) return { ok: false, reason: describeDbError(error) };

  revalidatePath("/notebooks");
  return { ok: true };
}

/** Borra el cuaderno y, por cascada, todas sus notas. La barrera está en la UI. */
export async function deleteNotebook(notebookId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(notebookId);
  if (!parsed.success) return { ok: false, reason: "Cuaderno inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("notebooks").delete().eq("id", parsed.data);
  if (error) return { ok: false, reason: describeDbError(error) };

  revalidatePath("/notebooks");
  return { ok: true };
}

// =============================================================================
// Notas
// =============================================================================

/**
 * Crea una nota VACÍA y devuelve su id para abrirla de inmediato, igual que
 * `createProject`. Pedir el título antes de dejar escribir es la fricción que
 * hace que nadie apunte nada desde el móvil; el título se resuelve solo desde
 * la primera línea si el usuario no pone ninguno (ver `noteDisplayTitle`).
 */
export async function createNote(notebookId: string): Promise<ActionResult & { id?: string }> {
  const parsed = z.string().uuid().safeParse(notebookId);
  if (!parsed.success) return { ok: false, reason: "Cuaderno inválido." };

  const firma = await firmaDelUsuario();
  if (!firma) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .insert({
      notebook_id: parsed.data,
      created_by: firma.id,
      created_by_name: firma.name,
      updated_by: firma.id,
      updated_by_name: firma.name
    })
    .select("id")
    .single();
  if (error) return { ok: false, reason: describeDbError(error) };

  revalidatePath("/notebooks");
  return { ok: true, id: data.id as string };
}

export interface SaveNoteResult extends ActionResult {
  /** Versión ya guardada; el editor la usa para el siguiente guardado. */
  version?: number;
  updatedByName?: string;
  updatedAt?: string;
  /** true = alguien guardó antes que tú y NO se pisó su texto. */
  conflict?: boolean;
}

/**
 * Guarda una nota con concurrencia optimista.
 *
 * La nota es una página colaborativa: dos personas pueden estar escribiendo a
 * la vez. El `where ... and version = $expected` es lo que impide que el último
 * en guardar borre en silencio lo que acababa de escribir el otro — cero filas
 * afectadas significa exactamente eso, y entonces se relee la fila para poder
 * decir QUIÉN se adelantó en vez de un "error al guardar" sin dueño.
 *
 * Mismo patrón `version` que projects/tasks/knowledge_items, aplicado aquí por
 * primera vez a un texto largo, que es donde de verdad duele perder trabajo.
 */
export async function saveNote(
  noteId: string,
  title: string,
  body: string,
  expectedVersion: number
): Promise<SaveNoteResult> {
  const parsed = z
    .object({
      noteId: z.string().uuid(),
      title: z.string().max(300),
      body: z.string(),
      expectedVersion: z.number().int().positive()
    })
    .safeParse({ noteId, title, body, expectedVersion });
  if (!parsed.success) return { ok: false, reason: "No se pudo guardar: los datos de la nota no son válidos." };

  const firma = await firmaDelUsuario();
  if (!firma) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión — copia tu texto antes de recargar." };

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("notes")
    .update({
      title: parsed.data.title,
      body: parsed.data.body,
      version: parsed.data.expectedVersion + 1,
      updated_by: firma.id,
      updated_by_name: firma.name,
      updated_at: now
    })
    .eq("id", parsed.data.noteId)
    .eq("version", parsed.data.expectedVersion)
    .select("version, updated_by_name, updated_at")
    .maybeSingle();

  if (error) return { ok: false, reason: describeDbError(error) };

  if (!data) {
    // O alguien guardó antes, o no tienes permiso de escritura. Se distingue
    // releyendo: si la fila se ve pero con otra versión, es lo primero.
    const { data: actual } = await supabase
      .from("notes")
      .select("version, updated_by_name")
      .eq("id", parsed.data.noteId)
      .maybeSingle();

    if (actual && actual.version !== parsed.data.expectedVersion) {
      return {
        ok: false,
        conflict: true,
        version: actual.version,
        updatedByName: actual.updated_by_name,
        reason: `${actual.updated_by_name || "Otra persona"} guardó esta nota mientras escribías. Tu texto NO se ha perdido: cópialo, recarga y vuelve a pegarlo.`
      };
    }

    return { ok: false, reason: "No tienes permiso para editar esta nota, o ya no existe." };
  }

  revalidatePath("/notebooks");
  return { ok: true, version: data.version, updatedByName: data.updated_by_name, updatedAt: data.updated_at };
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(noteId);
  if (!parsed.success) return { ok: false, reason: "Nota inválida." };

  const supabase = await createClient();
  const { error } = await supabase.from("notes").delete().eq("id", parsed.data);
  if (error) return { ok: false, reason: describeDbError(error) };

  revalidatePath("/notebooks");
  return { ok: true };
}

// =============================================================================
// Búsqueda
// =============================================================================

export interface NoteHit {
  id: string;
  notebookId: string;
  notebookTitle: string;
  title: string;
  snippet: string;
  updatedAt: string;
  updatedByName: string;
}

/**
 * Busca en las notas del espacio activo.
 *
 * El RPC `search_notes` NO es SECURITY DEFINER: la RLS se aplica dentro, así
 * que esta acción no puede devolver una nota que quien busca no deba ver.
 */
export async function searchNotes(workspaceId: string, query: string): Promise<ActionResult & { hits?: NoteHit[] }> {
  const parsed = z.object({ workspaceId: z.string().uuid(), query: z.string() }).safeParse({ workspaceId, query });
  if (!parsed.success) return { ok: false, reason: "Búsqueda inválida." };
  if (!parsed.data.query.trim()) return { ok: true, hits: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_notes", {
    p_workspace_id: parsed.data.workspaceId,
    p_query: parsed.data.query
  });
  if (error) return { ok: false, reason: describeDbError(error) };

  const hits: NoteHit[] = (data ?? []).map((row) => ({
    id: row.id,
    notebookId: row.notebook_id,
    notebookTitle: row.notebook_title,
    title: row.title,
    snippet: row.snippet ?? "",
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name
  }));

  return { ok: true, hits };
}
