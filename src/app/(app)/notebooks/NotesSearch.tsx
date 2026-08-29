"use client";
// Búsqueda de notas dentro del espacio activo.
//
// La búsqueda ocurre en la BASE y no filtrando en el cliente: traerse todas las
// notas del espacio para buscar sobre ellas sería descargar cada cuerpo entero
// en cada pulsación, y en un móvil eso se nota. Además el índice está en
// español (`to_tsvector('spanish', …)`), así que lematiza y prescinde de los
// acentos: buscar "direccion" encuentra "dirección", y "acuerdos" encuentra
// "acuerdo".
//
// El RPC que hay detrás NO es SECURITY DEFINER: la RLS se aplica dentro, así
// que esto no puede devolver una nota que quien busca no deba ver.
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { searchNotes, type NoteHit } from "./actions";
import { noteExcerpt } from "@/lib/domain/notes/markup.ts";

const RETARDO_MS = 300;

export default function NotesSearch({ workspaceId }: { workspaceId: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<NoteHit[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    const texto = query.trim();

    if (!texto) {
      setHits([]);
      setAbierto(false);
      return;
    }

    temporizador.current = setTimeout(() => {
      startTransition(async () => {
        const result = await searchNotes(workspaceId, texto);
        if (!result.ok) {
          setError(result.reason ?? "No se pudo buscar.");
          setHits([]);
        } else {
          setError(null);
          setHits(result.hits ?? []);
        }
        setAbierto(true);
      });
    }, RETARDO_MS);

    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [query, workspaceId]);

  return (
    <div className="nb-search">
      <input
        type="search"
        className="ex-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => hits.length && setAbierto(true)}
        placeholder="Buscar en las notas…"
        aria-label="Buscar en las notas del espacio"
        enterKeyHint="search"
      />

      {abierto && (
        <>
          {/* El fondo cierra los resultados al tocar fuera: en un móvil no hay
              "clic fuera" evidente si el panel no ocupa toda la pantalla. */}
          <div className="ex-backdrop" onClick={() => setAbierto(false)} />
          <div className="nb-search-results" role="listbox" aria-label="Resultados">
            {pending && <p className="nb-search-empty">Buscando…</p>}
            {!pending && error && (
              <p className="nb-search-empty" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
            {!pending && !error && !hits.length && (
              <p className="nb-search-empty">Ninguna nota coincide con «{query.trim()}».</p>
            )}
            {hits.map((hit) => (
              <Link
                key={hit.id}
                href={`/notebooks?ws=${workspaceId}&notebook=${hit.notebookId}&note=${hit.id}`}
                className="nb-search-hit"
                onClick={() => setAbierto(false)}
              >
                <span className="nb-search-hit-title">{hit.title || "Nota sin título"}</span>
                <span className="nb-search-hit-book">{hit.notebookTitle}</span>
                {/* El fragmento viene de ts_headline, que corta sobre el texto
                    crudo y por tanto arrastra el marcado ("## Asistentes").
                    noteExcerpt lo aplana igual que en la lista de notas, así
                    que el resultado se lee como una frase y no como código. */}
                {hit.snippet && <span className="nb-search-hit-snippet">{noteExcerpt(hit.snippet, 120)}</span>}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
