"use client";
// Recorre Block[] y pinta un EditableLine por línea. Es el dueño del FOCO y de
// todo lo que ocurre ENTRE bloques: Enter, Backspace al inicio, flechas en el
// borde y el autoformato al escribir.
//
// El estado vive arriba (NoteEditor) porque la pila de deshacer y el
// autoguardado lo necesitan. Aquí sólo se calculan bloques nuevos y se avisa,
// junto con dónde debe quedar el cursor.
import { useRef, type KeyboardEvent, type MouseEvent } from "react";
import EditableLine from "./EditableLine";
import type { Block, Inline } from "@/lib/domain/notes/markup.ts";
import {
  mergeBlocks,
  plainLength,
  partirConEnter,
  setBlockStyle,
  textoDeBloque,
  toggleTodo,
  type BlockStyle
} from "@/lib/domain/notes/edit.ts";
import {
  alinearClaves,
  clavesTrasEnter,
  clavesTrasFundirBloques,
  clavesTrasFundirLinea,
  clavesTrasSalirDeLista,
  type Claves
} from "@/lib/domain/notes/claves.ts";
import { offsetDelCursor } from "@/lib/dom/linea-dom.ts";

/** Dónde está el cursor: qué bloque, qué línea dentro de él, y qué tramo.
 *
 *  `seq` sube cada vez que el MODELO decide mover el cursor (Enter, Backspace,
 *  una marca, un deshacer). Escribir NO lo sube. Es lo único que le permite a
 *  EditableLine distinguir «colócate aquí» de «el usuario está tecleando»:
 *  sin esa distinción devolvía el cursor al inicio en cada tecla y la nota se
 *  escribía al revés. */
export interface Cursor {
  block: number;
  item: number;
  start: number;
  end: number;
  seq: number;
}

export interface NoteDocProps {
  blocks: Block[];
  onChange: (blocks: Block[], cursor: Cursor) => void;
  cursor: Cursor;
  onCursor: (cursor: Cursor) => void;
  readOnly?: boolean;
}

// Lo que convierte un bloque al vuelo mientras escribes. De aquí sale la
// sensación de rapidez, y sale casi gratis porque es una operación pura.
const ATAJOS: { patron: RegExp; estilo: BlockStyle }[] = [
  { patron: /^#\s$/, estilo: "title" },
  { patron: /^##\s$/, estilo: "heading" },
  { patron: /^###\s$/, estilo: "subheading" },
  { patron: /^(\[\]|\[ \]|[-*]\s\[\s?\])\s$/, estilo: "todo" },
  { patron: /^[-*]\s$/, estilo: "bullets" },
  { patron: /^\d+[.)]\s$/, estilo: "ordered" },
  { patron: /^>\s$/, estilo: "quote" }
];

const CELDA_VACIA = (): Inline[] => [{ kind: "text", text: "" }];
const PARRAFO_VACIO = (): Block => ({ kind: "paragraph", content: CELDA_VACIA() });

/** Devuelve el bloque con una de sus líneas sustituida.
 *  Va exportada porque NoteEditor la reutiliza para aplicar marcas y enlaces;
 *  duplicarla allí serían dos sitios que se desincronizan. */
export function conLinea(block: Block, indice: number, content: Inline[]): Block {
  switch (block.kind) {
    case "bullets":
    case "ordered":
      return { kind: block.kind, items: block.items.map((it, i) => (i === indice ? content : it)) };
    case "todo":
      return {
        kind: "todo",
        items: block.items.map((it, i) => (i === indice ? { ...it, content } : it))
      };
    case "mono":
      return { kind: "mono", text: content.map((p) => p.text).join("") };
    case "table": {
      const ancho = block.head.length;
      if (indice < ancho) {
        return { ...block, head: block.head.map((c, i) => (i === indice ? content : c)) };
      }
      const plano = indice - ancho;
      const fila = Math.floor(plano / ancho);
      const col = plano % ancho;
      return {
        ...block,
        rows: block.rows.map((f, i) => (i === fila ? f.map((c, j) => (j === col ? content : c)) : f))
      };
    }
    default:
      return { ...block, content };
  }
}

/** Quita una línea de un bloque; `null` si era la última que quedaba. */
function quitarLinea(block: Block, indice: number): Block | null {
  if (block.kind === "bullets" || block.kind === "ordered") {
    const items = block.items.filter((_, i) => i !== indice);
    return items.length ? { kind: block.kind, items } : null;
  }
  if (block.kind === "todo") {
    const items = block.items.filter((_, i) => i !== indice);
    return items.length ? { kind: "todo", items } : null;
  }
  return null;
}

function anadirColumna(t: Extract<Block, { kind: "table" }>): Block {
  return {
    kind: "table",
    head: [...t.head, CELDA_VACIA()],
    rows: t.rows.map((fila) => [...fila, CELDA_VACIA()])
  };
}

function anadirFila(t: Extract<Block, { kind: "table" }>): Block {
  return { kind: "table", head: t.head, rows: [...t.rows, t.head.map(() => CELDA_VACIA())] };
}

function quitarFila(t: Extract<Block, { kind: "table" }>, indice: number): Block {
  // Una tabla sin filas sigue siendo una tabla (encabezado solo).
  return { kind: "table", head: t.head, rows: t.rows.filter((_, i) => i !== indice) };
}

export default function NoteDoc({ blocks, onChange, cursor, onCursor, readOnly }: NoteDocProps) {
  /** Cursor que el MODELO impone: sube `seq` para que EditableLine lo aplique. */
  const mover = (c: Omit<Cursor, "seq">): Cursor => ({ ...c, seq: cursor.seq + 1 });

  // CLAVES ESTABLES (D-157). Enter y Backspace dejan el cursor en una línea que
  // conserva la clave —y por tanto el nodo— de la línea donde se pulsó, así que
  // el foco no tiene que saltar a otro contenteditable: el iPhone no lo seguía y
  // escribía en la línea de arriba. Se alinean en cada render porque un deshacer
  // o un cambio de estilo también cambian `blocks`; ahí se conservan por
  // posición, como hacían las claves por índice.
  const contador = useRef(0);
  const nueva = () => `l${++contador.current}`;
  const clavesRef = useRef<Claves>({ bloques: [], items: [] });
  clavesRef.current = alinearClaves(clavesRef.current, blocks, nueva);
  const claves = clavesRef.current;

  function reemplazar(indice: number, nuevos: Block[], cur: Cursor) {
    onChange([...blocks.slice(0, indice), ...nuevos, ...blocks.slice(indice + 1)], cur);
  }

  function alEscribir(bi: number, ii: number, content: Inline[], caret: number) {
    const bloque = blocks[bi];
    if (!bloque) return;

    // Autoformato: sólo en la primera línea de un párrafo y sólo si TODO lo
    // escrito hasta ahora es el atajo. Así «# » al empezar convierte, pero
    // «un # a media frase» no.
    if (bloque.kind === "paragraph" && ii === 0) {
      const llano = content.map((p) => p.text).join("");
      const atajo = ATAJOS.find((a) => a.patron.test(llano));
      if (atajo) {
        reemplazar(bi, [setBlockStyle(PARRAFO_VACIO(), atajo.estilo)], mover({
          block: bi,
          item: 0,
          start: 0,
          end: 0
        }));
        return;
      }
    }

    // El offset viene leído del DOM, no adivinado — lo necesita la barra de
    // formato para saber sobre qué actuar. Pero `seq` NO sube: teclear no
    // mueve el cursor, ya está donde el navegador lo puso, y subirlo haría
    // repintar y reponer en cada tecla, que es de donde salían los fallos.
    reemplazar(bi, [conLinea(bloque, ii, content)], {
      ...cursor,
      block: bi,
      item: ii,
      start: caret,
      end: caret
    });
  }

  function alPulsar(e: KeyboardEvent<HTMLDivElement>, bi: number, ii: number) {
    const bloque = blocks[bi];
    if (!bloque || readOnly) return;
    // Dónde está el cursor se lee del DOM, no de `cursor`: el modelo se entera
    // por `selectionchange`, que llega DESPUÉS, y tras tocar o escribir deprisa
    // puede ir una tecla por detrás. Partir por un offset viejo corta mal.
    const aqui = offsetDelCursor(e.currentTarget);
    const lineas = textoDeBloque(bloque);
    const linea = lineas[ii] ?? [];
    const largo = plainLength(linea);
    const enLista =
      bloque.kind === "bullets" || bloque.kind === "ordered" || bloque.kind === "todo";

    // Tab recorre las celdas de una tabla; en la última, crea fila.
    if (e.key === "Tab" && bloque.kind === "table") {
      e.preventDefault();
      const total = lineas.length;
      const siguiente = e.shiftKey ? ii - 1 : ii + 1;
      if (siguiente >= total) {
        reemplazar(bi, [anadirFila(bloque)], mover({ block: bi, item: total, start: 0, end: 0 }));
        return;
      }
      if (siguiente < 0) return;
      onCursor(mover({ block: bi, item: siguiente, start: 0, end: 0 }));
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      // Dentro de una celda, Enter no parte nada.
      if (bloque.kind === "table") return;

      // Enter en un ítem VACÍO sale de la lista. Sin esto, salir de una viñeta
      // en el móvil es imposible.
      if (enLista && largo === 0 && lineas.length > 1) {
        const sinItem = quitarLinea(bloque, ii);
        const nuevos = sinItem ? [sinItem, PARRAFO_VACIO()] : [PARRAFO_VACIO()];
        clavesRef.current = clavesTrasSalirDeLista(claves, bi, ii, sinItem !== null, nueva);
        reemplazar(bi, nuevos, mover({
          block: bi + (sinItem ? 1 : 0),
          item: 0,
          start: 0,
          end: 0
        }));
        return;
      }

      const { bloques, destino } = partirConEnter(bloque, ii, aqui.start);
      clavesRef.current = clavesTrasEnter(claves, bi, ii, bloque, bloques, nueva);
      reemplazar(bi, bloques, mover({
        block: bi + destino.bloque,
        item: destino.item,
        start: 0,
        end: 0
      }));
      return;
    }

    if (e.key === "Backspace" && aqui.start === 0 && aqui.end === 0) {
      // Dentro del bloque: funde con la línea anterior del mismo bloque.
      if (ii > 0) {
        e.preventDefault();
        const anterior = lineas[ii - 1] ?? [];
        const fundida = [...anterior, ...linea];
        const sinLinea = quitarLinea(bloque, ii);
        if (sinLinea) {
          clavesRef.current = clavesTrasFundirLinea(claves, bi, ii);
          reemplazar(bi, [conLinea(sinLinea, ii - 1, fundida)], mover({
            block: bi,
            item: ii - 1,
            start: plainLength(anterior),
            end: plainLength(anterior)
          }));
        }
        return;
      }
      // Al inicio del bloque: funde con el anterior, si tiene sentido.
      const previo = blocks[bi - 1];
      if (!previo) return;
      e.preventDefault();
      const lineasPrevias = textoDeBloque(previo);
      const ultima = lineasPrevias[lineasPrevias.length - 1] ?? [];
      const destino: Cursor = mover({
        block: bi - 1,
        item: lineasPrevias.length - 1,
        start: plainLength(ultima),
        end: plainLength(ultima)
      });
      // mergeBlocks devuelve un ARRAY: el bloque fundido primero y, si a la
      // lista le sobraban ítems, esos detrás como bloque propio.
      const fundido = mergeBlocks(previo, bloque);
      if (!fundido) {
        // Con una tabla o un bloque monoespaciado no se funde: sólo se mueve el
        // foco. Fundir ahí destruiría la rejilla o el sangrado.
        onCursor(destino);
        return;
      }
      clavesRef.current = clavesTrasFundirBloques(claves, bi, bloque, fundido);
      onChange([...blocks.slice(0, bi - 1), ...fundido, ...blocks.slice(bi + 1)], destino);
      return;
    }

    if (e.key === "ArrowUp" && aqui.start === 0) {
      if (ii > 0) {
        e.preventDefault();
        onCursor(mover({ block: bi, item: ii - 1, start: 0, end: 0 }));
        return;
      }
      const previo = blocks[bi - 1];
      if (!previo) return;
      e.preventDefault();
      onCursor(mover({ block: bi - 1, item: textoDeBloque(previo).length - 1, start: 0, end: 0 }));
      return;
    }

    if (e.key === "ArrowDown" && aqui.start === largo) {
      if (ii < lineas.length - 1) {
        e.preventDefault();
        onCursor(mover({ block: bi, item: ii + 1, start: 0, end: 0 }));
        return;
      }
      if (bi < blocks.length - 1) {
        e.preventDefault();
        onCursor(mover({ block: bi + 1, item: 0, start: 0, end: 0 }));
      }
    }
  }

  return (
    <div className="nb-doc nb-prose">
      {blocks.map((bloque, bi) => (
        <BloqueEditable
          key={claves.bloques[bi]}
          clavesLineas={claves.items[bi] ?? []}
          bloque={bloque}
          indice={bi}
          cursor={cursor}
          readOnly={readOnly}
          onEscribir={alEscribir}
          onPulsar={alPulsar}
          onSelect={(ii, start, end) => onCursor({ ...cursor, block: bi, item: ii, start, end })}
          onToggle={(ii) => reemplazar(bi, [toggleTodo(bloque, ii)], cursor)}
          onTabla={(nuevo) => reemplazar(bi, [nuevo], cursor)}
        />
      ))}
    </div>
  );
}

function BloqueEditable({
  bloque,
  clavesLineas,
  indice,
  cursor,
  readOnly,
  onEscribir,
  onPulsar,
  onSelect,
  onToggle,
  onTabla
}: {
  bloque: Block;
  /** Clave de cada ítem de lista: el `<li>` del cursor sobrevive a Enter y Backspace. */
  clavesLineas: string[];
  indice: number;
  cursor: Cursor;
  readOnly?: boolean;
  onEscribir: (bi: number, ii: number, content: Inline[], caret: number) => void;
  onPulsar: (e: KeyboardEvent<HTMLDivElement>, bi: number, ii: number) => void;
  onSelect: (ii: number, start: number, end: number) => void;
  onToggle: (ii: number) => void;
  onTabla: (nuevo: Block) => void;
}) {
  const enfocado = (ii: number) => cursor.block === indice && cursor.item === ii;

  const linea = (content: Inline[], ii: number, className: string, placeholder?: string) => (
    <EditableLine
      className={`nb-line ${className}`.trim()}
      content={content}
      readOnly={readOnly}
      placeholder={placeholder}
      autoFocus={enfocado(ii)}
      caret={enfocado(ii) ? cursor.start : null}
      caretEnd={enfocado(ii) ? cursor.end : null}
      caretSeq={cursor.seq}
      onChange={(c, caretNuevo) => onEscribir(indice, ii, c, caretNuevo)}
      onKey={(e) => onPulsar(e, indice, ii)}
      onSelect={(start, end) => onSelect(ii, start, end)}
    />
  );

  // Sin robar el foco: si el botón se lo lleva, la selección se pierde antes
  // de poder aplicarle nada.
  const sinRobarFoco = (e: MouseEvent) => e.preventDefault();

  switch (bloque.kind) {
    case "heading": {
      const Tag = bloque.level === 1 ? "h2" : bloque.level === 2 ? "h3" : "h4";
      return <Tag>{linea(bloque.content, 0, `nb-h${bloque.level}`)}</Tag>;
    }
    case "quote":
      return <blockquote>{linea(bloque.content, 0, "nb-quote")}</blockquote>;
    case "mono":
      return (
        <pre className="nb-mono">{linea([{ kind: "text", text: bloque.text }], 0, "nb-mono-line")}</pre>
      );
    case "bullets":
      return (
        <ul>
          {bloque.items.map((it, i) => (
            <li key={clavesLineas[i] ?? i}>{linea(it, i, "")}</li>
          ))}
        </ul>
      );
    case "ordered":
      return (
        <ol>
          {bloque.items.map((it, i) => (
            <li key={clavesLineas[i] ?? i}>{linea(it, i, "")}</li>
          ))}
        </ol>
      );
    case "todo":
      return (
        <ul className="nb-todo">
          {bloque.items.map((it, i) => (
            <li key={clavesLineas[i] ?? i} className={it.done ? "hecha" : undefined}>
              {/* Fuera del contenteditable: marcar no es escribir, y así no roba
                  el foco ni hace saltar el teclado. */}
              <input
                type="checkbox"
                checked={it.done}
                disabled={readOnly}
                onChange={() => onToggle(i)}
                onMouseDown={sinRobarFoco}
                aria-label={it.content.map((p) => p.text).join("") || "pendiente"}
              />
              {linea(it.content, i, "")}
            </li>
          ))}
        </ul>
      );
    case "table": {
      const ancho = bloque.head.length;
      // Mismo orden que textoDeBloque: encabezado y luego filas. Ese índice ES
      // el índice del cursor, así que no puede divergir.
      const indiceDe = (fila: number, col: number) => (fila === -1 ? col : ancho * (fila + 1) + col);
      return (
        <div className="nb-table-wrap">
          <table className="nb-table nb-table-edit">
            <thead>
              <tr>
                {bloque.head.map((celda, c) => (
                  <th key={c}>{linea(celda, indiceDe(-1, c), "nb-celda")}</th>
                ))}
                {!readOnly && (
                  <th className="nb-table-ctl">
                    <button
                      type="button"
                      title="Añadir columna"
                      onMouseDown={sinRobarFoco}
                      onClick={() => onTabla(anadirColumna(bloque))}
                    >
                      ＋
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {bloque.rows.map((fila, f) => (
                <tr key={f}>
                  {fila.map((celda, c) => (
                    <td key={c}>{linea(celda, indiceDe(f, c), "nb-celda")}</td>
                  ))}
                  {!readOnly && (
                    <td className="nb-table-ctl">
                      <button
                        type="button"
                        title="Quitar fila"
                        onMouseDown={sinRobarFoco}
                        onClick={() => onTabla(quitarFila(bloque, f))}
                      >
                        −
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!readOnly && (
                <tr>
                  <td className="nb-table-ctl" colSpan={ancho + 1}>
                    <button
                      type="button"
                      title="Añadir fila"
                      onMouseDown={sinRobarFoco}
                      onClick={() => onTabla(anadirFila(bloque))}
                    >
                      ＋ Fila
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return <p>{linea(bloque.content, 0, "", indice === 0 ? "Escribe aquí…" : undefined)}</p>;
  }
}
