"use client";
// La paleta: Cmd+K (o Ctrl+K) desde cualquier pantalla.
//
// Hace dos cosas, y en ese orden: BUSCAR en todo el espacio y CREAR una tarea
// con lo que se acaba de escribir. La segunda existe porque la mitad de las
// veces que uno busca algo es porque no lo encuentra — y lo que quería era
// apuntarlo.
//
// Se monta en AppShell, el único ancestro común de todas las pantallas. El
// debounce y el `useTransition` son los mismos que ya usa la búsqueda de notas
// (notebooks/NotesSearch.tsx): buscar en cada pulsación satura el servidor y
// llena la pantalla de resultados que ya no interesan.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchWorkspace, type SearchHit } from "@/lib/search/actions";
import { quickAddTask } from "@/lib/search/quick-add";
import { hitHref, parseQuery, isSearchable, KIND_LABEL } from "@/lib/domain/search/query.ts";

const RETARDO_MS = 250;

export default function CommandPalette({ workspaceId }: { workspaceId: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setUnknown([]);
    setError(null);
  }, []);

  // Cmd+K en Mac, Ctrl+K en el resto. Se captura en `keydown` del documento
  // porque tiene que funcionar sin que ningún campo tenga el foco.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    if (!open || !workspaceId) return;

    const parsed = parseQuery(query);
    if (!isSearchable(parsed)) {
      setHits([]);
      setUnknown(parsed.unknown);
      return;
    }

    temporizador.current = setTimeout(() => {
      startTransition(async () => {
        const result = await searchWorkspace(workspaceId, query);
        setHits(result.hits);
        setUnknown(result.unknown);
        setError(result.ok ? null : (result.reason ?? "No se pudo buscar."));
      });
    }, RETARDO_MS);

    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [query, open, workspaceId]);

  function go(hit: SearchHit) {
    if (!workspaceId) return;
    close();
    router.push(hitHref(hit, workspaceId));
  }

  function crear() {
    const titulo = parseQuery(query).text.trim();
    if (!titulo || !workspaceId) return;
    startTransition(async () => {
      const result = await quickAddTask(workspaceId, titulo);
      if (!result.ok) {
        setError(result.reason ?? "No se pudo crear la tarea.");
        return;
      }
      close();
      if (result.taskId) router.push(`/execution?ws=${workspaceId}&task=${result.taskId}`);
    });
  }

  if (!open) return null;

  const puedeCrear = parseQuery(query).text.trim().length >= 2;

  return (
    <>
      <div className="ex-backdrop" onClick={close} />
      <div
        role="dialog"
        aria-label="Buscar o crear"
        className="card"
        style={{
          position: "fixed",
          zIndex: "var(--z-popover)",
          top: "12vh",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(620px, calc(100vw - 24px))",
          maxHeight: "70vh",
          overflowY: "auto",
          padding: 12
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en el espacio…  tipo:tarea  de:ana  antes:2026-09-01"
          style={{ width: "100%" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const first = hits[0];
              if (first) go(first);
              else if (puedeCrear) crear();
            }
          }}
        />

        {!workspaceId && (
          <div className="text-xs" style={{ color: "var(--muted)", marginTop: 8 }}>
            No encontramos un espacio de trabajo activo para buscar.
          </div>
        )}

        {unknown.length > 0 && (
          <div className="text-xs" style={{ color: "var(--warn, var(--muted))", marginTop: 8 }}>
            No entendí {unknown.join(", ")} — se buscó como texto.
          </div>
        )}

        {error && (
          <div className="text-xs" style={{ color: "var(--danger)", marginTop: 8 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          {hits.map((hit) => (
            <button
              key={`${hit.kind}-${hit.id}`}
              className="ex-menu-item"
              style={{ display: "block", width: "100%", textAlign: "left", whiteSpace: "normal" }}
              onClick={() => go(hit)}
            >
              <span className="text-xs font-bold" style={{ color: "var(--c-purple)" }}>
                {KIND_LABEL[hit.kind]}
              </span>{" "}
              <b className="text-sm">{hit.title || "(sin título)"}</b>
              {hit.snippet && (
                <span className="text-xs block" style={{ color: "var(--muted)" }}>
                  {hit.snippet}
                </span>
              )}
            </button>
          ))}

          {!pending && query.trim() && !hits.length && (
            <div className="text-xs" style={{ color: "var(--muted)", padding: "8px 4px" }}>
              Nada coincide.
            </div>
          )}

          {puedeCrear && (
            <button
              className="ex-menu-item"
              style={{ display: "block", width: "100%", textAlign: "left" }}
              disabled={pending}
              onClick={crear}
            >
              <b className="text-sm">Crear tarea «{parseQuery(query).text.trim()}»</b>
              <span className="text-xs block" style={{ color: "var(--muted)" }}>
                En el primer proyecto del espacio
              </span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
