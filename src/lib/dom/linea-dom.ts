// El DOM de una línea editable: leerlo, pintarlo, y mover el cursor por él.
//
// POR QUÉ ESTO VIVE FUERA DEL COMPONENTE
// Dos razones, y la segunda es la que importa.
//
// 1. Se puede PROBAR. `node --experimental-strip-types` no procesa JSX, así que
//    nada dentro de un .tsx tiene pruebas. Seis fallos de este editor pasaron
//    756 pruebas verdes —el cuerpo se escribía al revés, luego no se escribía—
//    porque ninguna tocaba el DOM. Aquí sí.
//
// 2. React NO debe renderizar los hijos de un contenteditable. Ese fue el fallo
//    de raíz, repetido tres veces: `content` era una prop, React reconciliaba
//    los hijos en cada tecla y destruía el cursor. Reponerlo con un offset
//    inventado escribía al revés; no reponerlo dejaba el campo muerto. La
//    salida no era ajustar CUÁNDO se repone, sino que React deje de tocar el
//    nodo: aquí se pinta a mano, y sólo cuando el modelo cambia de verdad.
import type { Inline } from "../domain/notes/markup.ts";

/** Las seis etiquetas que se aceptan al leer. Todo lo demás colapsa a texto. */
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

/** Etiqueta con la que se pinta cada marca. */
const ETIQUETA_DE: Record<Exclude<Inline["kind"], "text" | "link">, string> = {
  bold: "b",
  italic: "i",
  underline: "u",
  strike: "s",
  code: "code"
};

/**
 * Lee el contenido del nodo como modelo.
 *
 * No confía en lo que encuentre: fuera de la lista blanca, todo colapsa a
 * texto. Eso cubre el pegado desde Word o desde una web —el estilo se cae, el
 * texto sobrevive— y es la garantía de D-038 sostenida en el lado de la
 * ENTRADA, que con un textarea no hacía falta porque no había DOM que ensuciar.
 */
export function leerDom(el: HTMLElement): Inline[] {
  const out: Inline[] = [];

  function recorrer(nodo: Node, marca: Inline["kind"] | null, href: string | null) {
    if (nodo.nodeType === 3) {
      const text = nodo.textContent ?? "";
      if (!text) return;
      if (href) out.push({ kind: "link", text, href });
      else out.push({ kind: marca ?? "text", text } as Inline);
      return;
    }
    if (nodo.nodeType !== 1) return;

    const elemento = nodo as HTMLElement;
    // El salto de línea que mete el navegador dentro de un contenteditable.
    if (elemento.tagName === "BR") {
      out.push({ kind: "text", text: "\n" });
      return;
    }
    // Un <script> pegado no aporta ni marca ni texto.
    if (elemento.tagName === "SCRIPT" || elemento.tagName === "STYLE") return;

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

/**
 * Pinta el contenido dentro del nodo, sustituyendo lo que hubiera.
 *
 * Crea nodos de texto y elementos, nunca `innerHTML`: el cuerpo lo escribe un
 * colaborador y el texto nunca deja de ser texto.
 *
 * DESTRUYE la selección, porque reemplaza los nodos. Quien llame debe reponerla
 * con `ponerSeleccion` — y sobre todo, debe llamar sólo cuando el contenido
 * cambió de verdad (ver `mismoContenido`).
 */
export function pintarEnDom(el: HTMLElement, content: Inline[]): void {
  const doc = el.ownerDocument;
  while (el.firstChild) el.removeChild(el.firstChild);

  for (const parte of content) {
    if (parte.kind === "text") {
      el.appendChild(doc.createTextNode(parte.text));
      continue;
    }
    if (parte.kind === "link") {
      const a = doc.createElement("a");
      a.setAttribute("href", parte.href);
      a.setAttribute("rel", "noopener noreferrer");
      a.appendChild(doc.createTextNode(parte.text));
      el.appendChild(a);
      continue;
    }
    const etiqueta = ETIQUETA_DE[parte.kind];
    const nodo = doc.createElement(etiqueta);
    nodo.appendChild(doc.createTextNode(parte.text));
    el.appendChild(nodo);
  }

  // Un nodo sin hijos no tiene dónde apoyar el cursor.
  if (!el.firstChild) el.appendChild(doc.createTextNode(""));
}

/** ¿Son el mismo contenido? Decide si hace falta repintar — y repintar de más
 *  es exactamente lo que mataba el cursor al teclear. */
export function mismoContenido(a: Inline[], b: Inline[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((parte, i) => {
    const otra = b[i];
    if (!otra || parte.kind !== otra.kind || parte.text !== otra.text) return false;
    if (parte.kind === "link" && otra.kind === "link") return parte.href === otra.href;
    return true;
  });
}

/** Localiza un offset de texto visible como (nodo, desplazamiento) del DOM. */
function puntoEn(el: HTMLElement, offset: number): { nodo: Node; pos: number } | null {
  let restante = offset;
  let encontrado: { nodo: Node; pos: number } | null = null;

  const recorrer = (nodo: Node): void => {
    if (encontrado) return;
    if (nodo.nodeType === 3) {
      const largo = nodo.textContent?.length ?? 0;
      if (restante <= largo) {
        encontrado = { nodo, pos: restante };
        return;
      }
      restante -= largo;
      return;
    }
    for (const hijo of Array.from(nodo.childNodes)) recorrer(hijo);
  };
  recorrer(el);
  return encontrado;
}

/** Offsets de la selección en coordenadas de TEXTO VISIBLE, que es donde vive
 *  la aritmética de `edit.ts`. */
export function offsetDelCursor(el: HTMLElement): { start: number; end: number } {
  const sel = el.ownerDocument.defaultView?.getSelection();
  if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
  const rango = sel.getRangeAt(0);
  if (!el.contains(rango.startContainer)) return { start: 0, end: 0 };

  const medir = (nodo: Node, offset: number): number => {
    const antes = el.ownerDocument.createRange();
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

/**
 * Restaura una selección por offsets de texto visible.
 *
 * Restaura el TRAMO, no sólo el punto: colapsarlo borraría la selección del
 * usuario justo cuando la necesita, que es al tocar «B».
 */
export function ponerSeleccion(el: HTMLElement, start: number, end: number): void {
  const doc = el.ownerDocument;
  const sel = doc.defaultView?.getSelection();
  if (!sel) return;
  const rango = doc.createRange();
  const a = puntoEn(el, start);
  const b = end === start ? a : puntoEn(el, end);

  if (!a) {
    rango.selectNodeContents(el);
    rango.collapse(true);
  } else {
    rango.setStart(a.nodo, a.pos);
    if (b) rango.setEnd(b.nodo, b.pos);
    else rango.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(rango);
}
