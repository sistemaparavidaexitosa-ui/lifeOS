"use client";

import { useState, useTransition } from "react";
import { upsertBook, deleteBook, addBookNote } from "./actions";

interface NoteLite {
  id: string;
  pageRef: number;
  text: string;
}

export default function BookForm({
  book,
  notes = []
}: {
  book?: { id: string; title: string; author: string; status: string; currentPage: number; totalPages: number };
  notes?: NoteLite[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [notePage, setNotePage] = useState(book?.currentPage ?? 0);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {book ? "Abrir" : "+ Libro"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertBook(book?.id ?? null, fd);
              setError(null);
              if (!book) setOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <input name="title" placeholder="Título" defaultValue={book?.title} required />
        <input name="author" placeholder="Autor" defaultValue={book?.author} />
        <div className="grid grid-cols-3 gap-2">
          <select name="status" defaultValue={book?.status ?? "Por leer"}>
            <option>Por leer</option>
            <option>Leyendo</option>
            <option>Terminado</option>
          </select>
          <input name="currentPage" type="number" placeholder="Pág. actual" defaultValue={book?.currentPage ?? 0} />
          <input name="totalPages" type="number" placeholder="Total págs." defaultValue={book?.totalPages ?? 0} />
        </div>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {book && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await deleteBook(book.id); setOpen(false); })}
            >
              Eliminar
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
            Cerrar
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={pending}>
            {pending ? "…" : "Guardar"}
          </button>
        </div>
      </form>

      {book && (
        <div className="mt-3">
          <b className="text-sm">Notas de lectura</b>
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl px-2.5 py-2 my-2 text-sm" style={{ background: "var(--surface)" }}>
              {n.text}
              <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                pág. {n.pageRef}
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input type="number" value={notePage} onChange={(e) => setNotePage(Number(e.target.value))} style={{ width: 90 }} placeholder="Página" />
            <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Escribe una nota…" />
            <button
              className="btn-ghost btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await addBookNote(book.id, notePage, noteText);
                  setNoteText("");
                })
              }
            >
              Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
