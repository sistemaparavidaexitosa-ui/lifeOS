"use client";

import { useState, useTransition } from "react";
import { upsertBook, deleteBook, addBookNote } from "./actions";
import type { BookCandidate } from "@/lib/domain/development/book-lookup.ts";

interface NoteLite {
  id: string;
  pageRef: number;
  text: string;
}

interface BookLite {
  id: string;
  title: string;
  author: string;
  status: string;
  currentPage: number;
  totalPages: number;
  coverUrl: string;
}

/** Portada real cuando el libro tiene una; si no, el mismo emoji de siempre. */
export function BookCover({ url, size = 60 }: { url: string; size?: number }) {
  const width = Math.round(size * 0.73);
  if (!url) {
    return (
      <div
        className="rounded-lg grid place-items-center text-white font-black flex-shrink-0"
        style={{ width, height: size, background: "linear-gradient(145deg, var(--accent2), var(--accent))" }}
      >
        📖
      </div>
    );
  }
  return (
    // La portada es una URL de un tercero (Open Library / Google Books), no un
    // archivo nuestro. next/image la pasaría por el optimizador de Vercel,
    // gastando cuota en una miniatura de 180px que no controlamos; se carga
    // directo, con el host permitido en img-src (middleware.ts, §5.1).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={width}
      height={size}
      loading="lazy"
      className="rounded-lg flex-shrink-0"
      style={{ width, height: size, objectFit: "cover", background: "var(--surface2)" }}
    />
  );
}

export default function BookForm({ book, notes = [] }: { book?: BookLite; notes?: NoteLite[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [notePage, setNotePage] = useState(book?.currentPage ?? 0);

  // Campos que el buscador de metadatos puede rellenar: controlados, para que
  // elegir un resultado se vea reflejado en el formulario. El estado y la
  // página actual siguen siendo del usuario y nadie los toca.
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [totalPages, setTotalPages] = useState(book?.totalPages ?? 0);
  const [coverUrl, setCoverUrl] = useState(book?.coverUrl ?? "");

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<BookCandidate[]>([]);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  async function runLookup() {
    if (!term.trim() || looking) return;
    setLooking(true);
    setLookupMsg(null);
    setResults([]);
    try {
      const response = await fetch(`/api/development/book-lookup?q=${encodeURIComponent(term.trim())}`);
      const data = (await response.json()) as { ok: boolean; candidates: BookCandidate[]; reason?: string };
      if (!data.ok) setLookupMsg(data.reason ?? "No se pudo buscar.");
      else if (!data.candidates.length) setLookupMsg("Sin resultados. Captúralo a mano.");
      else setResults(data.candidates);
    } catch {
      // El buscador es opcional: que falle no puede romper el formulario.
      setLookupMsg("No se pudo buscar. Captura el libro a mano.");
    } finally {
      setLooking(false);
    }
  }

  function pick(candidate: BookCandidate) {
    setTitle(candidate.title);
    setAuthor(candidate.author);
    if (candidate.totalPages > 0) setTotalPages(candidate.totalPages);
    setCoverUrl(candidate.coverUrl);
    setResults([]);
    setLookupMsg(null);
    setTerm("");
  }

  function resetForm() {
    setTitle("");
    setAuthor("");
    setTotalPages(0);
    setCoverUrl("");
    setResults([]);
    setLookupMsg(null);
    setTerm("");
  }

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {book ? "Abrir" : "+ Libro"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      {/* §5.1: metadatos desde Open Library / Google Books. El fetch sale del
          servidor por /api/development/book-lookup; el navegador solo pide la
          portada. Sin credenciales y sin registro: es una comodidad, no un
          requisito — el formulario de abajo funciona igual sin tocar esto. */}
      <div className="flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runLookup();
            }
          }}
          placeholder="Buscar por título o ISBN…"
        />
        <button type="button" className="btn-ghost btn-sm" disabled={looking || !term.trim()} onClick={() => void runLookup()}>
          {looking ? "…" : "Buscar"}
        </button>
      </div>
      {lookupMsg && (
        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          {lookupMsg}
        </div>
      )}
      {results.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {results.map((c, i) => (
            <button
              key={`${c.source}-${c.isbn || i}`}
              type="button"
              className="flex items-center gap-2 text-left rounded-xl p-1.5"
              style={{ background: "var(--surface)" }}
              onClick={() => pick(c)}
            >
              <BookCover url={c.coverUrl} size={44} />
              <span className="grow text-sm">
                <b>{c.title}</b>
                <span className="block text-xs" style={{ color: "var(--muted)" }}>
                  {c.author || "Autor desconocido"}
                  {c.totalPages > 0 ? ` · ${c.totalPages} págs.` : " · sin total de páginas"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <form
        action={(fd) =>
          startTransition(async () => {
            // La acción ya no lanza: devuelve { ok, reason } con un motivo
            // legible incluso en producción (src/lib/supabase/errors.ts). El
            // try/catch se conserva solo para lo que sigue siendo excepción de
            // verdad: que la petición ni siquiera llegue al servidor.
            try {
              const result = await upsertBook(book?.id ?? null, fd);
              if (!result.ok) {
                setError(result.reason ?? "No se pudo guardar el libro.");
                return;
              }
              setError(null);
              if (!book) {
                resetForm();
                setOpen(false);
              }
            } catch {
              setError("No se pudo contactar al servidor. Revisa tu conexión.");
            }
          })
        }
        className="flex flex-col gap-2 mt-2"
      >
        <div className="flex gap-2 items-start">
          <BookCover url={coverUrl} />
          <div className="grow flex flex-col gap-2">
            <input name="title" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <input name="author" placeholder="Autor" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
        </div>
        <input type="hidden" name="coverUrl" value={coverUrl} />
        <div className="grid grid-cols-3 gap-2">
          <select name="status" defaultValue={book?.status ?? "Por leer"}>
            <option>Por leer</option>
            <option>Leyendo</option>
            <option>Terminado</option>
          </select>
          <input name="currentPage" type="number" placeholder="Pág. actual" defaultValue={book?.currentPage ?? 0} />
          <input
            name="totalPages"
            type="number"
            placeholder="Total págs."
            value={totalPages}
            onChange={(e) => setTotalPages(Number(e.target.value))}
          />
        </div>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {book && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteBook(book.id);
                  if (!result.ok) {
                    setError(result.reason ?? "No se pudo eliminar el libro.");
                    return;
                  }
                  setOpen(false);
                })
              }
            >
              Eliminar
            </button>
          )}
          {coverUrl && (
            <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => setCoverUrl("")}>
              Quitar portada
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
                  const result = await addBookNote(book.id, notePage, noteText);
                  if (!result.ok) {
                    setNoteError(result.reason ?? "No se pudo agregar la nota.");
                    return;
                  }
                  setNoteError(null);
                  setNoteText("");
                })
              }
            >
              Agregar
            </button>
          </div>
          {noteError && <div className="text-xs mt-1" style={{ color: "var(--danger)" }}>{noteError}</div>}
        </div>
      )}
    </div>
  );
}
