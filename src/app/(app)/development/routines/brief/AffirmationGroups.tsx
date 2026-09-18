"use client";

import { CATEGORIAS } from "@/lib/domain/identity/categorias.ts";
import type { BriefView, Reaccion } from "@/lib/identity/brief-view";
import { IconThumbDown, IconThumbUp } from "@/components/icons";

/**
 * Las afirmaciones, agrupadas por categoría.
 *
 * POR QUÉ AGRUPAR. Con cinco afirmaciones una lista plana se lee de un vistazo.
 * Con veinte es un muro: la vista se desliza hasta el final sin detenerse en
 * ninguna, que es justo lo contrario de lo que se busca. Partidas en «Dinero»,
 * «Disciplina», «Relaciones» se leen por bloques y cada bloque cabe de una vez.
 *
 * El orden lo pone `CATEGORIAS` y no los datos: así dos días seguidos enseñan
 * los mismos temas en el mismo sitio, y la persona sabe dónde mirar. Las que no
 * tienen categoría —las del respaldo, o una etiqueta que no se reconoció— caen
 * en «Otras» al final, nunca desaparecen.
 *
 * Con un solo grupo no se pinta el encabezado: un título sobre un único bloque
 * es ruido.
 */
export default function AffirmationGroups({
  brief,
  traitNames,
  onReact
}: {
  brief: BriefView;
  traitNames: Record<string, string>;
  onReact: (itemId: string, reaction: Reaccion) => void;
}) {
  const grupos = agrupar(brief.affirmations);
  const conEncabezado = grupos.length > 1;

  return (
    <div className="flex flex-col gap-4 mt-4">
      {grupos.map(([titulo, afirmaciones]) => (
        <section key={titulo} className="flex flex-col gap-2.5">
          {conEncabezado && (
            <h3 className="text-[11px] font-semibold uppercase tracking-wide m-0" style={{ color: "var(--muted)" }}>
              {titulo}
            </h3>
          )}
          <ul className="flex flex-col gap-2.5 m-0 p-0" style={{ listStyle: "none" }}>
            {afirmaciones.map((a) => {
              const r = brief.reactions[a.id];
              return (
                <li key={a.id} className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-2 rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: "var(--accent)" }} />
                  <div className="grow min-w-0">
                    <p className="text-sm leading-relaxed m-0" style={{ overflowWrap: "anywhere" }}>
                      {a.text}
                    </p>
                    {a.traitId && traitNames[a.traitId] && (
                      <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                        Vota por {traitNames[a.traitId]}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0" role="group" aria-label="¿Te resuena?">
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={r === "resuena"}
                      onClick={() => onReact(a.id, "resuena")}
                      style={r === "resuena" ? { background: "color-mix(in srgb, var(--ok) 20%, var(--surface))", color: "var(--text)" } : undefined}
                      title="Me resuena"
                    >
                      <IconThumbUp width={14} height={14} aria-hidden="true" />
                      <span className="sr-only">Me resuena</span>
                    </button>
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={r === "no_resuena"}
                      onClick={() => onReact(a.id, "no_resuena")}
                      style={r === "no_resuena" ? { background: "color-mix(in srgb, var(--danger) 18%, var(--surface))", color: "var(--text)" } : undefined}
                      title="No me resuena"
                    >
                      <IconThumbDown width={14} height={14} aria-hidden="true" />
                      <span className="sr-only">No me resuena</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

type Afirmacion = BriefView["affirmations"][number];

/** Por categoría, en el orden del catálogo, con «Otras» al final. */
function agrupar(afirmaciones: Afirmacion[]): [string, Afirmacion[]][] {
  const porCategoria = new Map<string, Afirmacion[]>();
  const otras: Afirmacion[] = [];

  for (const a of afirmaciones) {
    if (!a.category) {
      otras.push(a);
      continue;
    }
    const lista = porCategoria.get(a.category) ?? [];
    lista.push(a);
    porCategoria.set(a.category, lista);
  }

  const grupos: [string, Afirmacion[]][] = [];
  for (const categoria of CATEGORIAS) {
    const lista = porCategoria.get(categoria);
    if (lista?.length) grupos.push([categoria, lista]);
  }
  if (otras.length) grupos.push([grupos.length ? "Otras" : "Tus afirmaciones de hoy", otras]);
  return grupos;
}
