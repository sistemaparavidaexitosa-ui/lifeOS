"use client";
// Notas de un cuaderno, ordenadas por lo último tocado.
//
// Por fecha de edición y no alfabéticamente ni por creación: en un cuaderno de
// equipo lo que se busca casi siempre es lo que alguien acaba de escribir.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createNote, deleteNotebook, renameNotebook } from "./actions";
import { fdatetime } from "@/lib/format";

export interface NoteCard {
  id: string;
  title: string;
  excerpt: string;
  updatedAt: string;
  updatedByName: string;
}

export default function NoteList({
  notes,
  notebook,
  workspaceId,
  canWrite
}: {
  notes: NoteCard[];
  notebook: { id: string; title: string; icon: string };
  workspaceId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(notebook.title);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  function nueva() {
    startTransition(async () => {
      const result = await createNote(notebook.id);
      if (!result.ok || !result.id) {
        setError(result.reason ?? "No se pudo crear la nota.");
        return;
      }
      router.push(`/notebooks?ws=${workspaceId}&notebook=${notebook.id}&note=${result.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <nav className="nb-crumbs" aria-label="Ruta">
        <Link href={`/notebooks?ws=${workspaceId}`} className="nb-crumb-back">
          ← Cuadernos
        </Link>
        <span className="nb-crumb-sep">/</span>
        <span className="nb-crumb-current">
          {notebook.icon} {notebook.title}
        </span>
      </nav>

      <div className="nb-section-head">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setName(notebook.title);
                setRenaming(false);
              }
              if (e.key === "Enter") {
                e.preventDefault();
                startTransition(async () => {
                  const result = await renameNotebook(notebook.id, name, notebook.icon);
                  if (!result.ok) setError(result.reason ?? "No se pudo renombrar.");
                  setRenaming(false);
                  router.refresh();
                });
              }
            }}
            aria-label="Nombre del cuaderno"
            enterKeyHint="done"
            style={{ maxWidth: 320 }}
          />
        ) : (
          <h3 className="font-bold">
            {notebook.icon} {notebook.title}
          </h3>
        )}
        <div className="flex gap-2">
          {canWrite && !renaming && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setRenaming(true)}>
              Renombrar
            </button>
          )}
          {canWrite && (
            <button type="button" className="btn-primary btn-sm" onClick={nueva} disabled={pending}>
              {pending ? "…" : "+ Nueva nota"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="ex-alert" role="alert">
          {error}
        </div>
      )}

      {!notes.length ? (
        <div className="card">
          <div className="text-center py-6" style={{ color: "var(--muted)" }}>
            <div className="text-3xl mb-1.5">📝</div>
            Este cuaderno está vacío. {canWrite ? "Crea la primera nota." : "Nadie ha escrito todavía."}
          </div>
        </div>
      ) : (
        <div className="nb-notes">
          {notes.map((n) => (
            <Link
              key={n.id}
              href={`/notebooks?ws=${workspaceId}&notebook=${notebook.id}&note=${n.id}`}
              className="nb-note-row"
            >
              <span className="nb-note-title">{n.title}</span>
              {n.excerpt && <span className="nb-note-excerpt">{n.excerpt}</span>}
              <span className="nb-note-meta">
                {n.updatedByName ? `${n.updatedByName} · ` : ""}
                {fdatetime(n.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="nb-danger">
          {!deleting ? (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setDeleting(true)}>
              Eliminar cuaderno
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="ex-danger-note">
                <b>Esto no se puede deshacer.</b> Se eliminará <b>{notebook.title}</b>
                {notes.length > 0 ? (
                  <>
                    {" "}
                    y sus <b>{notes.length}</b> nota{notes.length === 1 ? "" : "s"}, incluidas las que escribieron otras
                    personas.
                  </>
                ) : (
                  <>, que está vacío.</>
                )}
              </div>
              {/* Teclear el nombre, igual que al borrar un proyecto: el clic de
                  más se da por reflejo, teclear un nombre no. Y en un móvil el
                  clic de más es todavía más fácil. */}
              <label className="text-xs flex flex-col gap-1" style={{ color: "var(--muted)" }}>
                Escribe <b style={{ color: "var(--text)" }}>{notebook.title}</b> para confirmar
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  aria-label="Confirmar nombre del cuaderno"
                  autoComplete="off"
                />
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost btn-sm" onClick={() => setDeleting(false)} disabled={pending} style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  style={{ flex: 1 }}
                  disabled={pending || confirmText.trim() !== notebook.title.trim()}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteNotebook(notebook.id);
                      if (!result.ok) {
                        setError(result.reason ?? "No se pudo eliminar el cuaderno.");
                        return;
                      }
                      router.push(`/notebooks?ws=${workspaceId}`);
                      router.refresh();
                    })
                  }
                >
                  Eliminar cuaderno
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
