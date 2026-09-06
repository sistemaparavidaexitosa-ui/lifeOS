"use client";
// El ÚNICO contenteditable del proyecto. Todo lo demás lo rodea.
//
// LOS DOS REGÍMENES
// Escribir texto: el DOM manda. React pinta este nodo al montarlo y NO vuelve
// a tocarlo mientras tenga el foco. Cada `input` se lee recorriendo el DOM y
// se avisa hacia arriba, pero nunca se escribe de vuelta. Sin esto el cursor
// salta en cada tecla y el dictado de iOS se rompe.
//
// Dar formato: el modelo manda. Al recibir un `caret` distinto de null se
// repinta desde `content` y se restaura el cursor por offset. Ocurre en un
// toque, no en cada tecla.
//
// LA LISTA BLANCA
// Al leer el DOM no se confía en lo que haya. Se aceptan seis etiquetas y TODO
// lo demás colapsa a texto. Eso cubre el pegado desde Word o desde una web: el
// estilo se cae, el texto sobrevive. Es la garantía de D-038 sostenida en el
// lado de la ENTRADA, que con un textarea no hacía falta.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { Inline } from "@/lib/domain/notes/markup.ts";

export interface EditableLineProps {
  content: Inline[];
  /** Al escribir. NO repinta: el DOM es la fuente de verdad mientras hay foco. */
  onChange: (content: Inline[]) => void;
  /** Enter, Backspace y flechas los decide NoteDoc, que es quien ve los bloques. */
  onKey: (e: KeyboardEvent<HTMLDivElement>) => void;
  onSelect: (start: number, end: number) => void;
  autoFocus?: boolean;
  /** Pedir un cursor concreto al repintar. `null` = no tocar el DOM. */
  caret?: number | null;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

const ETIQUETAS: Record<string, Inline["kind"]> = {
  B: "bold",
  STRONG: "bold",
  I: "italic",
  EM: "italic",
  U: "underline",
  S: "strike",
  STRIKE: "strike",
  CODE: "code"
};

export function leerDom(el: HTMLElement): Inline[] {
  const out: Inline[] = [];

  function recorrer(nodo: Node, marca: Inline["kind"] | null, href: string | null) {
    if (nodo.nodeType === Node.TEXT_NODE) {
      const text = nodo.textContent ?? "";
      if (!text) return;
      if (href) out.push({ kind: "link", text, href });
      else out.push({ kind: marca ?? "text", text } as Inline);
      return;
    }
    if (nodo.nodeType !== Node.ELEMENT_NODE) return;

    const elemento = nodo as HTMLElement;
    // El salto de línea que mete el navegador dentro de un contenteditable.
    if (elemento.tagName === "BR") {
      out.push({ kind: "text", text: "\n" });
      return;
    }

    let marcaHija = marca;
    let hrefHijo = href;
    if (elemento.tagName === "A") {
      const destino = elemento.getAttribute("href") ?? "";
      // El esquema se valida AQUÍ además de en el parser: un `javascript:`
      // pegado no puede llegar al modelo por esta puerta.
      if (/^https?:\/\//i.test(destino)) hrefHijo = destino;
    } else if (ETIQUETAS[elemento.tagName]) {
      marcaHija = ETIQUETAS[elemento.tagName] ?? marca;
    }
    // Cualquier otra etiqueta (SPAN, DIV, FONT, lo que pegue el navegador) no
    // aporta marca: sus hijos se recorren y su estilo se pierde.

    for (const hijo of Array.from(elemento.childNodes)) recorrer(hijo, marcaHija, hrefHijo);
  }

  for (const hijo of Array.from(el.childNodes)) recorrer(hijo, null, null);

  // Fusiona contiguos iguales, igual que markup.ts, para que la aritmética de
  // offsets de edit.ts vea un fragmento por tramo.
  const fusionado: Inline[] = [];
  for (const parte of out) {
    const previa = fusionado[fusionado.length - 1];
    const fundibles =
      previa &&
      previa.kind === parte.kind &&
      (parte.kind !== "link" || (previa.kind === "link" && previa.href === parte.href));
    if (previa && fundibles) {
      fusionado[fusionado.length - 1] = { ...previa, text: previa.text + parte.text };
      continue;
    }
    fusionado.push(parte);
  }
  return fusionado.length ? fusionado : [{ kind: "text", text: "" }];
}

/** Offsets del cursor en coordenadas de TEXTO VISIBLE, que es donde vive edit.ts. */
export function offsetDelCursor(el: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
  const rango = sel.getRangeAt(0);
  if (!el.contains(rango.startContainer)) return { start: 0, end: 0 };

  const medir = (nodo: Node, offset: number): number => {
    const antes = document.createRange();
    antes.selectNodeContents(el);
    try {
      antes.setEnd(nodo, offset);
    } catch {
      return 0;
    }
    return antes.toString().length;
  };

  const a = medir(rango.startContainer, rango.startOffset);
  const b = medir(rango.endContainer, rango.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** Coloca el cursor en un offset de texto visible. */
export function ponerCursor(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const rango = document.createRange();
  let restante = offset;
  let colocado = false;

  const recorrer = (nodo: Node): void => {
    if (colocado) return;
    if (nodo.nodeType === Node.TEXT_NODE) {
      const largo = nodo.textContent?.length ?? 0;
      if (restante <= largo) {
        rango.setStart(nodo, restante);
        colocado = true;
        return;
      }
      restante -= largo;
      return;
    }
    for (const hijo of Array.from(nodo.childNodes)) recorrer(hijo);
  };
  recorrer(el);

  // Un bloque vacío no tiene nodo de texto donde apoyar el cursor.
  if (!colocado) rango.selectNodeContents(el);
  rango.collapse(true);
  sel.removeAllRanges();
  sel.addRange(rango);
}

function pintar(content: Inline[]): ReactNode {
  return content.map((parte, i) => {
    switch (parte.kind) {
      case "bold":
        return <b key={i}>{parte.text}</b>;
      case "italic":
        return <i key={i}>{parte.text}</i>;
      case "underline":
        return <u key={i}>{parte.text}</u>;
      case "strike":
        return <s key={i}>{parte.text}</s>;
      case "code":
        return <code key={i}>{parte.text}</code>;
      case "link":
        return (
          <a key={i} href={parte.href} rel="noopener noreferrer">
            {parte.text}
          </a>
        );
      default:
        return <span key={i}>{parte.text}</span>;
    }
  });
}

export default function EditableLine({
  content,
  onChange,
  onKey,
  onSelect,
  autoFocus,
  caret,
  readOnly,
  placeholder,
  className
}: EditableLineProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // El único momento en que React escribe en este nodo: cuando le piden un
  // cursor concreto (una marca aplicada, un deshacer). Mientras se escribe,
  // `caret` es null y este efecto no hace nada.
  useEffect(() => {
    const el = ref.current;
    if (!el || caret === null || caret === undefined) return;
    if (document.activeElement !== el) el.focus();
    ponerCursor(el, caret);
  }, [caret, content]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const vacio = content.every((p) => !p.text);

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
      onInput={(e) => onChange(leerDom(e.currentTarget))}
      onKeyDown={onKey}
      onSelect={(e) => {
        const { start, end } = offsetDelCursor(e.currentTarget);
        onSelect(start, end);
      }}
      onPaste={(e) => {
        // Se pega SIEMPRE como texto llano. Dejar que el navegador inserte su
        // HTML y limpiarlo después deja restos distintos en cada navegador.
        // `insertText` es la única excepción a «nada de execCommand»: su salida
        // es texto, no marcado, y conserva el undo nativo dentro del bloque.
        e.preventDefault();
        const texto = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, texto);
      }}
    >
      {pintar(content)}
    </div>
  );
}
