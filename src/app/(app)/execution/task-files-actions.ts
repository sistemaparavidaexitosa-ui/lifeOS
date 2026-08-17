"use server";
// FASE 3 (Drawer lateral — Archivos). El BINARIO del archivo se sube desde
// el navegador directamente a Supabase Storage (supabase.storage.from(
// "task-files").upload(...) en TaskFilesPanel.tsx, Client Component) — no a
// través de una Server Action, ya que Next.js Server Actions no son el
// canal recomendado para subir binarios grandes. Estas Server Actions solo
// registran/eliminan el METADATO en public.task_files (migración
// 0020_task_files.sql), protegido por las mismas RLS que el resto del
// proyecto (has_project_access/can_edit_project vía la tarea).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const recordSchema = z.object({
  taskId: z.string().uuid(),
  fileName: z.string().min(1),
  storagePath: z.string().min(1),
  sizeBytes: z.coerce.number().int().min(0),
  contentType: z.string().min(1)
});

/**
 * Registra los metadatos de un archivo YA SUBIDO al bucket "task-files".
 * Debe llamarse DESPUÉS de que supabase.storage.from("task-files").upload()
 * haya resuelto exitosamente en el cliente.
 */
export async function recordTaskFileUpload(input: {
  taskId: string;
  fileName: string;
  storagePath: string;
  sizeBytes: number;
  contentType: string;
}) {
  const parsed = recordSchema.parse(input);

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.from("task_files").insert({
    task_id: parsed.taskId,
    file_name: parsed.fileName,
    storage_path: parsed.storagePath,
    size_bytes: parsed.sizeBytes,
    content_type: parsed.contentType,
    uploaded_by: user.id
  });
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "task.file.upload",
    object: parsed.taskId,
    meta: { fileName: parsed.fileName, sizeBytes: parsed.sizeBytes }
  });
  revalidatePath("/execution");
}

const deleteSchema = z.object({
  fileId: z.string().uuid(),
  storagePath: z.string().min(1)
});

/** Elimina el binario del Storage y su fila de metadatos. */
export async function deleteTaskFile(fileId: string, storagePath: string) {
  const parsed = deleteSchema.parse({ fileId, storagePath });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error: storageErr } = await supabase.storage.from("task-files").remove([parsed.storagePath]);
  if (storageErr) throw new Error(storageErr.message);

  const { error } = await supabase.from("task_files").delete().eq("id", parsed.fileId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({ user_id: user.id, action: "task.file.delete", object: parsed.fileId });
  revalidatePath("/execution");
}
