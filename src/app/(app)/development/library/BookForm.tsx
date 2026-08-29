"use client";

import { useState, useTransition } from "react";
import { upsertBook, deleteBook, addBookNote } from "./actions";
import { coverProxyUrl, BOOK_CATEGORIES, type BookCandidate } from "@/lib/domain/development/book-lookup.ts";
import FormSheet, { Field, FormActions } from "../FormSheet";

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
  category: string;
}

/** Portada real cuando el libro tiene una; si no, el mismo emoji de siempre. */
export function BookCover({ url, size = 60 }: { url: string; size?: number }) {
  const width = Math.round(size * 0.73);
  // Se recuerda QUÉ url falló, no un booleano: así elegir otro candidato en el
  // buscador vuelve a intentar la portada nueva sin necesidad de resetear nada.
  const [failedUrl, setFailedUrl] = useState("");
  // La portada se pide a NUESTRO origen, no al proveedor: covers.openlibrary.org
  // responde 302 hacia archive.org y la CSP corta el redirect (ver el route
  // handler en /api/development/book-cover). Devuelve "" si no hay portada o si
  // la url guardada no pasa la lista blanca.
  const src = coverProxyUrl(url);

  if (!src || failedUrl === url) {
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
    // next/image la pasaría por el optimizador de Vercel, gastando cuota en una
    // miniatura de 180px; el proxy ya la sirve desde el mismo origen con cache.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={width}
      height={size}
      loading="lazy"
      // El proveedor puede no tener esa portada (el handler responde 404). Sin
      // esto, el usuario vería el icono de imagen rota del navegador en vez del
      // placeholder que la app ya tiene para "sin portada".
      onError={() => setFailedUrl(url)}
      className="rounded-lg flex-shrink-0"
      style={{ width, height: size, objectFit: "cover", background: "var(--surface2)" }}
    />
  );
}

export default function BookForm({ book, notes = [] }: { book?: BookLite; notes?: NoteLite[] }) {
  return (
    <FormSheet
      label={book ? "Abrir" : "+ Libro"}
      title={book ? book.title : "Nuevo libro"}
      variant={book ? "ghost" : "primary"}
    >
      {(close) => <BookFields book={book} notes={notes} close={close} />}
    </FormSheet>
  );
}

function BookFields({ book, notes, close }: { book?: BookLite; notes: NoteLite[]; close: () => void }) {
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
  // La categoría es controlada porque el buscador de metadatos la PROPONE:
  // elegir un candidato tiene que poder cambiarla, y `defaultValue` no lo haría.
  const [category, setCategory] = useState<string>(book?.category ?? "Otros");
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
    // La categoría propuesta NO se guarda a ciegas: cae en el select y el
    // usuario la ve antes de guardar. El mapeo se equivoca lo suficiente como
    // para no confiar en él, y "Otros" es su forma de decir "no supe".
    setCategory(candidate.suggestedCategory);
    setCoverUrl(candidate.coverUrl);
    setResults([]);
    setLookupMsg(null);
    setTerm("");
  }

  return (
    <>
      {/* §5.1: metadatos desde Open Library / Google Books. Todo sale por el
          servidor: los datos por /api/development/book-lookup y la portada por
          /api/development/book-cover. Sin credenciales y sin registro: es una
          comodidad, no un requisito — el formulario de abajo funciona igual
          sin tocar esto. */}
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
        {/* Sin `flex-shrink-0` el botón se comprimía hasta "Busc…" en cuanto el
            panel se estrechaba. */}
        <button
          type="button"
          className="btn-ghost btn-sm flex-shrink-0"
          disabled={looking || !term.trim()}
          onClick={() => void runLookup()}
        >
          {looking ? "…" : "Buscar"}
        </button>
      </div>
      {lookupMsg && (
        <div className="text-xs -mt-2" style={{ color: "var(--muted)" }}>
          {lookupMsg}
        </div>
      )}
      {results.length > 0 && (
        <div className="flex flex-col gap-1 -mt-2">
          {results.map((c, i) => (
            <button
              key={`${c.source}-${c.isbn || i}`}
              type="button"
              className="flex items-center gap-2 text-left rounded-xl p-1.5"
              style={{ background: "var(--surface2)" }}
              onClick={() => pick(c)}
            >
              <BookCover url={c.coverUrl} size={44} />
              <span className="grow min-w-0 text-sm">
                <b style={{ overflowWrap: "anywhere" }}>{c.title}</b>
                <span className="block text-xs" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
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
              close();
            } catch {
              setError("No se pudo contactar al servidor. Revisa tu conexión.");
            }
          })
        }
        className="flex flex-col gap-3"
      >
        <div className="flex gap-3 items-start">
          <BookCover url={coverUrl} />
          <div className="grow min-w-0 flex flex-col gap-3">
            <Field label="Título">
              <input name="title" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
            <Field label="Autor">
              <input name="author" placeholder="Autor" value={author} onChange={(e) => setAuthor(e.target.value)} />
            </Field>
          </div>
        </div>
        <input type="hidden" name="coverUrl" value={coverUrl} />

        {/* Tres campos en una fila daban ~90px por columna en un móvil: el
            select de estado se cortaba y "Total págs." no cabía. El estado se
            queda con la línea entera y las dos páginas se reparten la de abajo;
            desde `sm` vuelven las tres columnas. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Estado" className="col-span-2 sm:col-span-1">
            <select name="status" defaultValue={book?.status ?? "Por leer"}>
              <option>Por leer</option>
              <option>Leyendo</option>
              <option>Terminado</option>
            </select>
          </Field>
          <Field label="Pág. actual">
            <input name="currentPage" type="number" min={0} defaultValue={book?.currentPage ?? 0} />
          </Field>
          <Field label="Total págs.">
            <input
              name="totalPages"
              type="number"
              min={0}
              value={totalPages}
              onChange={(e) => setTotalPages(Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="Categoría">
          <select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {BOOK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        {coverUrl && (
          <button
            type="button"
            className="btn-ghost btn-sm self-start"
            disabled={pending}
            onClick={() => setCoverUrl("")}
          >
            Quitar portada
          </button>
        )}
        {error && (
          <div className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <FormActions
          pending={pending}
          onCancel={close}
          onDelete={
            book
              ? () =>
                  startTransition(async () => {
                    const result = await deleteBook(book.id);
                    if (!result.ok) {
                      setError(result.reason ?? "No se pudo eliminar el libro.");
                      return;
                    }
                    close();
                  })
              : undefined
          }
        />
      </form>

      {book && (
        <div className="flex flex-col gap-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <b className="text-sm">Notas de lectura</b>
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl px-2.5 py-2 text-sm" style={{ background: "var(--surface2)" }}>
              <span style={{ overflowWrap: "anywhere" }}>{n.text}</span>
              <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                pág. {n.pageRef}
              </div>
            </div>
          ))}
          {/* Página + nota + botón en una sola fila dejaban al texto de la nota
              unos 120px. Apilado en móvil, en línea desde `sm`. */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="number"
              min={0}
              value={notePage}
              onChange={(e) => setNotePage(Number(e.target.value))}
              className="sm:w-24 sm:flex-shrink-0"
              placeholder="Página"
              aria-label="Página de la nota"
            />
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Escribe una nota…"
              aria-label="Texto de la nota"
            />
            <button
              type="button"
              className="btn-ghost btn-sm sm:flex-shrink-0"
              disabled={pending || !noteText.trim()}
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
          {noteError && (
            <div className="text-xs" style={{ color: "var(--danger)" }}>
              {noteError}
            </div>
          )}
        </div>
      )}
    </>
  );
}
