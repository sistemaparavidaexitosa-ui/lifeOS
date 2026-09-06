// Operaciones del editor sobre el árbol de una nota.
//
// POR QUÉ VIVE APARTE DE markup.ts
// markup.ts es el DIALECTO: texto ⇄ árbol. Este archivo es la EDICIÓN:
// árbol ⇄ árbol. Separarlos deja que el dialecto se pruebe sin conocer el
// editor, y que el editor se pruebe sin navegador.
//
// POR QUÉ TODO ES PURO
// El cursor de un contenteditable es lo único que obliga a tocar el DOM. Si
// además la lógica de marcas y bloques viviera ahí, no habría forma de
// probarla. Aquí no hay DOM, no hay React y no hay estado: entra un árbol,
// sale un árbol, y las pruebas corren en node sin navegador.
//
// EL MODELO ES PLANO A PROPÓSITO
// `Inline` no tiene hijos, así que negrita Y cursiva a la vez no se pueden
// representar. Es la misma limitación que ya tenía el dialecto, y sostenerla
// aquí evita un árbol anidado que el serializador no sabría escribir.
//
// QUÉ VIENE DESPUÉS (Task 7)
// Las operaciones de BLOQUE (setBlockStyle, splitBlock, mergeBlocks,
// toggleTodo, textoDeBloque) se añaden a este mismo archivo y reutilizan
// `sliceInlines` y `plainLength` de aquí abajo.
import type { Block, Inline } from "./markup.ts";

export type MarcaInline = "bold" | "italic" | "underline" | "strike" | "code";

/** Largo del texto VISIBLE. El cursor vive en estas coordenadas. */
export function plainLength(content: Inline[]): number {
  return content.reduce((total, parte) => total + parte.text.length, 0);
}

/** Copia un fragmento cambiándole el texto y conservando lo demás (el href). */
function conTexto(parte: Inline, text: string): Inline {
  return parte.kind === "link" ? { ...parte, text } : { ...parte, text };
}

export function sliceInlines(content: Inline[], start: number, end: number): Inline[] {
  const out: Inline[] = [];
  let cursor = 0;
  for (const parte of content) {
    const inicio = cursor;
    const fin = cursor + parte.text.length;
    cursor = fin;
    const desde = Math.max(start, inicio);
    const hasta = Math.min(end, fin);
    if (hasta <= desde) continue;
    out.push(conTexto(parte, parte.text.slice(desde - inicio, hasta - inicio)));
  }
  return out;
}

export function hasMark(
  content: Inline[],
  start: number,
  end: number,
  mark: MarcaInline
): boolean {
  const tramo = sliceInlines(content, start, end);
  return tramo.length > 0 && tramo.every((parte) => parte.kind === mark);
}

/**
 * Aplica o quita una marca sobre [start, end). Alterna: si TODO el rango ya
 * la lleva, la quita — es lo que hace el botón B del iPhone.
 *
 * Los enlaces se dejan intactos: perder el destino al poner negrita sería
 * destruir información que el usuario no puede recuperar.
 */
export function applyMark(
  content: Inline[],
  start: number,
  end: number,
  mark: MarcaInline
): Inline[] {
  if (end <= start) return content;
  const quitar = hasMark(content, start, end, mark);

  const out: Inline[] = [];
  let cursor = 0;
  for (const parte of content) {
    const inicio = cursor;
    const fin = cursor + parte.text.length;
    cursor = fin;

    const antes = parte.text.slice(0, Math.max(0, Math.min(start, fin) - inicio));
    const dentroDesde = Math.max(start, inicio);
    const dentroHasta = Math.min(end, fin);
    const dentro =
      dentroHasta > dentroDesde ? parte.text.slice(dentroDesde - inicio, dentroHasta - inicio) : "";
    const despues = parte.text.slice(Math.max(0, Math.max(end, inicio) - inicio));

    if (antes) out.push(conTexto(parte, antes));
    if (dentro) {
      if (parte.kind === "link") out.push(conTexto(parte, dentro));
      else out.push({ kind: quitar ? "text" : mark, text: dentro });
    }
    if (despues) out.push(conTexto(parte, despues));
  }

  return fusionar(out);
}

/** Pega fragmentos contiguos del mismo tipo. Espeja a markup.ts. */
function fusionar(partes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const parte of partes) {
    const previa = out[out.length - 1];
    if (previa && previa.kind === parte.kind && parte.kind !== "link") {
      out[out.length - 1] = conTexto(previa, previa.text + parte.text);
      continue;
    }
    out.push(parte);
  }
  return out.length ? out : [{ kind: "text", text: "" }];
}
