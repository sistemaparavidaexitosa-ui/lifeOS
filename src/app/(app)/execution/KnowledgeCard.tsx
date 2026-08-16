"use client";

// FASE 4 — Base de conocimiento (equivalente a knowledgeCard() en
// LifeOS 4.html). La tabla `knowledge_items` ya existía en el esquema
// (0003_execution_collaboration.sql) con RLS/GRANTs correctos, pero no
// tenía ninguna UI — este componente cierra ese gap. FR-EXE-008: soporta
// notas, enlaces, documentos y archivos, con versión incremental en cada
// edición (nunca sobrescribe silenciosamente).

import { useState, useTransition } from "react";
import { addKnowledgeItem, deleteKnowledgeItem, updateKnowledgeItem, type KnowledgeItem } from "./logbook-knowledge-actions";

const TYPE_LABEL: Record<KnowledgeItem["type"], string> = {
  doc: "Documento",
  link: "Enlace",
  note: "Nota",
  file: "Archivo"
};

const TYPE_ICON: Record<KnowledgeItem["type"], string> = {
  doc: "📄",
  link: "🔗",
  note: "📝",
  file: "📎"
};

export default function KnowledgeCard({ projectId, items }: { projectId: string; items: KnowledgeItem[] }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<KnowledgeItem["type"]>("note");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetForm() {
    setTitle("");
    setType("note");
    setUrl("");
    setNote("");
    setEditingId(null);
  }

  function startEdit(item: KnowledgeItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setType(item.type);
    setUrl(item.url);
    setNote(item.note);
  }

  return (
    <div className="card" style={{ background: "var(--surface)" }}>
      <b className="text-sm">Base de conocimiento</b>
      <div className="text-xs" style={{ color: "var(--muted)", margin: "4px 0 8px" }}>
        Notas, enlaces, documentos y archivos del proyecto (FR-EXE-008). Cada edición suma una versión.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
        {!items.length && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Sin ítems todavía.
          </div>
        )}
        {items.map((it) => (
          <div key={it.id} style={{ background: "var(--surface2)", borderRadius: 12, padding: "8px 10px" }}>
            <div className="flex items-center justify-between" style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span className="text-sm" style={{ fontWeight: 700 }}>
                {TYPE_ICON[it.type]} {it.title}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="text-xs"
                  style={{ color: "var(--accent-d)", background: "none", border: 0, cursor: "pointer" }}
                  onClick={() => startEdit(it)}
                  disabled={pending}
                >
                  Editar
                </button>
                <button
                  className="text-xs"
                  style={{ color: "var(--danger)", background: "none", border: 0, cursor: "pointer" }}
                  onClick={() => startTransition(() => deleteKnowledgeItem(it.id))}
                  disabled={pending}
                  aria-label="Eliminar ítem"
                >
                  ✕
                </button>
              </div>
            </div>
            {it.url && (
              <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: "var(--info)", display: "block", marginTop: 3 }}>
                {it.url}
              </a>
            )}
            {it.note && (
              <div className="text-sm" style={{ marginTop: 4 }}>
                {it.note}
              </div>
            )}
            <div className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
              {TYPE_LABEL[it.type]} · v{it.version} · {new Date(it.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {editingId && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Editando ítem existente — al guardar se incrementa la versión.
          </div>
        )}
        <input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value as KnowledgeItem["type"])} disabled={!!editingId}>
          <option value="note">Nota</option>
          <option value="link">Enlace</option>
          <option value="doc">Documento</option>
          <option value="file">Archivo</option>
        </select>
        <input placeholder="URL (opcional)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <textarea placeholder="Nota / descripción (opcional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        {error && (
          <div className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn-primary btn-sm"
            disabled={pending || !title.trim()}
            onClick={() =>
              startTransition(async () => {
                try {
                  if (editingId) {
                    await updateKnowledgeItem(editingId, title, url, note);
                  } else {
                    await addKnowledgeItem(projectId, title, type, url, note);
                  }
                  resetForm();
                  setError(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Error");
                }
              })
            }
          >
            {pending ? "…" : editingId ? "Guardar cambios (nueva versión)" : "Agregar ítem"}
          </button>
          {editingId && (
            <button className="btn-ghost btn-sm" onClick={resetForm} disabled={pending}>
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
