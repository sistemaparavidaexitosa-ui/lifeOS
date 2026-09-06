"use client";
// El ÚNICO contenteditable del proyecto. Todo lo demás lo rodea.
//
// REACT NO RENDERIZA LOS HIJOS DE ESTE NODO. Ese es el diseño entero, y no es
// una optimización: es lo que hace que se pueda escribir.
//
// Durante tres intentos este componente sí los renderizaba, y cada tecla
// disparaba una reconciliación que destruía el cursor. Reponerlo con un offset
// adivinado escribía la nota al revés; dejar de reponerlo dejaba el campo sin
// aceptar texto; reponerlo con el offset bueno seguía peleando con React. El
// fallo no era CUÁNDO se reponía el cursor: era que React tocara el nodo.
//
// Ahora el nodo se pinta a mano (`pintarEnDom`) y sólo cuando el modelo trae
// algo distinto de lo que el propio nodo acaba de reportar. Al teclear, el
// modelo devuelve exactamente lo que emitimos, no se repinta, y el cursor se
// queda donde lo dejó el navegador — que es su dueño legítimo.
//
// La lógica de DOM vive en src/lib/dom/linea-dom.ts porque `node --test` no
// procesa JSX: aquí dentro no habría podido probarse, y no probarla es
// exactamente cómo se colaron los seis fallos anteriores.
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { Inline } from "@/lib/domain/notes/markup.ts";
import {
  leerDom,
  mismoContenido,
  offsetDelCursor,
  pintarEnDom,
  ponerSeleccion
} from "@/lib/dom/linea-dom.ts";

export interface EditableLineProps {
  content: Inline[];
  /** Al escribir: el contenido leído del DOM y dónde quedó el cursor. */
  onChange: (content: Inline[], caret: number) => void;
  /** Enter, Backspace y flechas los decide NoteDoc, que es quien ve los bloques. */
  onKey: (e: KeyboardEvent<HTMLDivElement>) => void;
  onSelect: (start: number, end: number) => void;
  autoFocus?: boolean;
  /** Inicio del tramo a restaurar cuando el modelo lo pide. */
  caret?: number | null;
  /** Fin del tramo. Si difiere de `caret` se restaura la SELECCIÓN entera:
   *  colapsarla borraría lo que el usuario acaba de seleccionar para dar
   *  formato, que es justo cuando hace falta. */
  caretEnd?: number | null;
  /** Sube cuando el MODELO mueve el cursor (Enter, deshacer, una marca).
   *  Teclear NO lo sube: ahí el cursor ya está donde debe. */
  caretSeq?: number;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

export default function EditableLine({
  content,
  onChange,
  onKey,
  onSelect,
  autoFocus,
  caret,
  caretEnd,
  caretSeq = 0,
  readOnly,
  placeholder,
  className
}: EditableLineProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Lo último que ESTE nodo reportó hacia arriba. Si el modelo devuelve eso
  // mismo, el DOM ya lo muestra y repintar sólo serviría para matar el cursor.
  const emitidoRef = useRef<Inline[] | null>(null);
  const componiendo = useRef(false);
  const ultimoSeq = useRef<number | null>(null);

  // Pintado: sólo cuando el contenido viene de FUERA.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (emitidoRef.current && mismoContenido(content, emitidoRef.current)) return;
    emitidoRef.current = null;
    pintarEnDom(el, content);
    if (caret !== null && caret !== undefined && el.ownerDocument.activeElement === el) {
      ponerSeleccion(el, caret, caretEnd ?? caret);
    }
  }, [content, caret, caretEnd]);

  // Foco: cuando el modelo manda el cursor a esta línea desde otra.
  useEffect(() => {
    const el = ref.current;
    if (!el || caret === null || caret === undefined) return;
    if (ultimoSeq.current === caretSeq) return;
    ultimoSeq.current = caretSeq;
    if (el.ownerDocument.activeElement !== el) el.focus();
    ponerSeleccion(el, caret, caretEnd ?? caret);
  }, [caret, caretEnd, caretSeq]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const vacio = content.every((p) => !p.text);

  function emitir(el: HTMLElement) {
    const leido = leerDom(el);
    emitidoRef.current = leido;
    onChange(leido, offsetDelCursor(el).start);
  }

  return (
    <div
      ref={ref}
      className={className}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="false"
      data-placeholder={placeholder}
      data-empty={vacio ? "true" : undefined}
      // Se escribe prosa, no identificadores (misma decisión que D-040).
      autoCapitalize="sentences"
      autoCorrect="on"
      spellCheck
      onCompositionStart={() => {
        componiendo.current = true;
      }}
      onCompositionEnd={(e) => {
        // El modelo se entera al TERMINAR la composición, no durante: avisar a
        // media palabra dictada la interrumpe.
        componiendo.current = false;
        emitir(e.currentTarget);
      }}
      onInput={(e) => {
        if (componiendo.current) return;
        emitir(e.currentTarget);
      }}
      onKeyDown={onKey}
      onSelect={(e) => {
        const { start, end } = offsetDelCursor(e.currentTarget);
        onSelect(start, end);
      }}
      onPaste={(e) => {
        // Se pega SIEMPRE como texto llano. Dejar que el navegador inserte su
        // HTML y limpiarlo después deja restos distintos en cada navegador.
        e.preventDefault();
        const texto = e.clipboardData.getData("text/plain");
        e.currentTarget.ownerDocument.execCommand("insertText", false, texto);
      }}
    />
  );
}
