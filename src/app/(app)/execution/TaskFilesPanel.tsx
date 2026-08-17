"use client";
// FASE 3 (Drawer lateral — Archivos). La subida del binario ocurre AQUÍ, en
// el navegador, usando el cliente Supabase de src/lib/supabase/client.ts
// (respeta RLS de storage.objects, migración 0020_task_files.sql). Solo el
// METADATO se persiste vía Server Action (task-files-actions.ts).
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordTaskFileUpload, deleteTaskFile } from "./task-files-actions";
import { IconTrash } from "@/components/icons";
import type { TaskDetailFile } from "./task-detail-actions";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

export default function TaskFilesPanel({
  taskId,
  files,
  onSaved
}: {
  taskId: string;
  files: TaskDetailFile[];
  onSaved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      // Convención de ruta: {task_id}/{timestamp}-{nombre-sanitizado} — las
      // políticas de storage.objects (migración 0020) parsean el primer
      // segmento como task_id vía storage.foldername(name)[1].
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const storagePath = `${taskId}/${Date.now()}-${safeName}`;
      const { error: uploadErr } = await supabase.storage.from("task-files").upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      });
      if (uploadErr) throw new Error(uploadErr.message);

      await recordTaskFileUpload({
        taskId,
        fileName: file.name,
        storagePath,
        sizeBytes: file.size,
        contentType: file.type || "application/octet-stream"
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDownload(file: TaskDetailFile) {
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: signErr } = await supabase.storage.from("task-files").createSignedUrl(file.storage_path, 60);
      if (signErr || !data?.signedUrl) throw new Error(signErr?.message ?? "No se pudo generar el enlace de descarga");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el archivo");
    }
  }

  return (
    <div>
      <label className="text-xs" style={{ color: "var(--muted)", fontWeight: 700 }}>
        Archivos
      </label>
      {!files.length && (
        <p className="text-xs" style={{ color: "var(--muted)", marginTop: 4 }}>
          Sin archivos adjuntos.
        </p>
      )}
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center justify-between"
          style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid var(--line)" }}
        >
          <button
            type="button"
            onClick={() => handleDownload(f)}
            className="text-sm"
            style={{
              background: "transparent",
              border: "none",
              textAlign: "left",
              padding: 0,
              minHeight: "auto",
              color: "var(--accent-d)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
            title={f.file_name}
          >
            📎 {f.file_name}
          </button>
          <span className="text-xs" style={{ color: "var(--muted)", flexShrink: 0 }}>
            {formatBytes(f.size_bytes)}
          </span>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await deleteTaskFile(f.id, f.storage_path);
                onSaved();
              })
            }
            className="btn-ghost btn-sm"
            style={{ color: "var(--danger)", flexShrink: 0, padding: 4, minHeight: "auto" }}
            disabled={pending}
            aria-label={`Eliminar ${f.file_name}`}
          >
            <IconTrash />
          </button>
        </div>
      ))}
      <input ref={inputRef} type="file" onChange={handleFileChange} disabled={uploading} style={{ marginTop: 8 }} />
      {uploading && (
        <p className="text-xs" style={{ color: "var(--muted)", marginTop: 4 }}>
          Subiendo…
        </p>
      )}
      {error && (
        <div className="chip danger" style={{ marginTop: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}
