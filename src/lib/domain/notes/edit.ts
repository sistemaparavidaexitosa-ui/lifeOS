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
import { parseNote, type Block, type Inline } from "./markup.ts";

export type MarcaInline = "bold" | "italic" | "underline" | "strike" | "code";

/** Largo del texto VISIBLE. El cursor vive en estas coordenadas. */
export function plainLength(content: Inline[]): number {
  return content.reduce((total, parte) => total + parte.text.length, 0);
}

/** Copia un fragmento cambiándole el texto y conservando lo demás (el href). */
function conTexto(parte: Inline, text: string): Inline {
  return { ...parte, text };
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

/**
 * Pega fragmentos contiguos del mismo tipo. Espeja a markup.ts.
 *
 * Los enlaces se funden entre sí sólo cuando comparten `href`: si no, marcar
 * a medias un enlace lo partiría en varios nodos `link` con el mismo destino
 * que ya nunca volverían a juntarse (y el serializador escribiría el mismo
 * href repetido en vez de un único enlace).
 */
function fusionar(partes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const parte of partes) {
    const previa = out[out.length - 1];
    if (previa && puedenFundirse(previa, parte)) {
      out[out.length - 1] = conTexto(previa, previa.text + parte.text);
      continue;
    }
    out.push(parte);
  }
  return out.length ? out : [{ kind: "text", text: "" }];
}

/** Dos fragmentos se funden si son del mismo tipo — y, si son enlaces, del mismo destino. */
function puedenFundirse(a: Inline, b: Inline): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "link" && b.kind === "link") return a.href === b.href;
  return true;
}

// ---------------------------------------------------------------------------
// OPERACIONES DE BLOQUE (Task 7)
//
// Lo de arriba edita el CONTENIDO de una línea (marcas). Lo de aquí abajo
// edita la ESTRUCTURA del documento: qué estilo tiene un bloque, cómo lo
// parte Enter, cómo lo funde Backspace. Reutiliza `plainLength` y
// `sliceInlines` de más arriba en vez de reimplementar el recorte de texto.
// ---------------------------------------------------------------------------

/** Los estilos que ofrece el menú «Aa» del editor. */
export type BlockStyle =
  | "title"
  | "heading"
  | "subheading"
  | "body"
  | "mono"
  | "quote"
  | "bullets"
  | "ordered"
  | "todo"
  | "table";

/**
 * Las líneas editables de un bloque, en el ORDEN en que el editor las pinta.
 * El índice dentro de este arreglo ES el índice de línea que usan
 * `splitBlock` y el cursor del editor: si este orden no coincide con el que
 * pinta la pantalla, el cursor salta al sitio equivocado. Por eso una tabla
 * devuelve primero el encabezado y luego las filas.
 */
export function textoDeBloque(block: Block): Inline[][] {
  switch (block.kind) {
    case "bullets":
    case "ordered":
      return block.items;
    case "todo":
      return block.items.map((item) => item.content);
    case "table":
      return [...block.head, ...block.rows.flat()];
    case "mono":
      return [[{ kind: "text", text: block.text }]];
    default:
      return [block.content];
  }
}

/** El estilo del menú «Aa» que le corresponde al bloque tal como está. */
export function styleOf(block: Block): BlockStyle {
  switch (block.kind) {
    case "heading":
      return block.level === 1 ? "title" : block.level === 2 ? "heading" : "subheading";
    case "bullets":
      return "bullets";
    case "ordered":
      return "ordered";
    case "todo":
      return "todo";
    case "quote":
      return "quote";
    case "mono":
      return "mono";
    case "table":
      return "table";
    default:
      return "body";
  }
}

/** El texto llano de una línea: concatena los fragmentos, sin separador. */
function textoLlano(linea: Inline[]): string {
  return linea.map((parte) => parte.text).join("");
}

/**
 * Une varias líneas en un único `Inline[]`, separadas por un salto de línea
 * que el párrafo (y el resto de bloques de una sola línea) sí respeta.
 * Fusiona los fragmentos resultantes con `fusionar`, así que dos líneas de
 * puro texto quedan como UN nodo — necesario para que el resultado sea
 * idéntico al que produciría escribir ese texto de una sola vez, y también
 * para normalizar el caso de cero líneas al nodo de texto vacío de siempre.
 */
function aplanar(lineas: Inline[][]): Inline[] {
  const partes: Inline[] = [];
  lineas.forEach((linea, i) => {
    if (i > 0) partes.push({ kind: "text", text: "\n" });
    partes.push(...linea);
  });
  return fusionar(partes);
}

/**
 * Convierte un bloque a cualquier estilo. Es TOTAL a propósito: convertir
 * cualquier bloque en cualquier estilo tiene que estar definido, incluidos
 * tabla→texto y texto→tabla. La regla que lo gobierna todo: NUNCA se pierde
 * texto — un caso sin definir aquí es un caso que el editor resolvería
 * improvisando en producción.
 */
export function setBlockStyle(block: Block, style: BlockStyle): Block {
  const lineas = textoDeBloque(block);
  const primera = lineas[0] ?? [{ kind: "text" as const, text: "" }];

  switch (style) {
    case "title":
      return { kind: "heading", level: 1, content: aplanar(lineas) };
    case "heading":
      return { kind: "heading", level: 2, content: aplanar(lineas) };
    case "subheading":
      return { kind: "heading", level: 3, content: aplanar(lineas) };
    case "quote":
      return { kind: "quote", content: aplanar(lineas) };
    case "bullets":
      return { kind: "bullets", items: lineas };
    case "ordered":
      return { kind: "ordered", items: lineas };
    case "todo":
      return { kind: "todo", items: lineas.map((content) => ({ done: false, content })) };
    case "mono":
      return { kind: "mono", text: lineas.map(textoLlano).join("\n") };
    case "table":
      // Una 2×2 con lo que había en la primera línea, como hace el iPhone.
      return {
        kind: "table",
        head: [primera, [{ kind: "text", text: "" }]],
        rows: [[[{ kind: "text", text: "" }], [{ kind: "text", text: "" }]]]
      };
    default:
      // "body": ningún caso lo captura arriba, cae aquí a propósito.
      return { kind: "paragraph", content: aplanar(lineas) };
  }
}

/** Marca o desmarca el ítem `index` de una lista de casillas. No-op en cualquier otro bloque. */
export function toggleTodo(block: Block, index: number): Block {
  if (block.kind !== "todo") return block;
  return {
    kind: "todo",
    items: block.items.map((item, i) => (i === index ? { ...item, done: !item.done } : item))
  };
}

/**
 * Enter. `itemIndex` es la línea dentro del bloque (0 salvo en listas y
 * tablas), `offset` la posición del cursor en ella. Devuelve los dos
 * bloques resultantes.
 */
export function splitBlock(block: Block, itemIndex: number, offset: number): [Block, Block] {
  const lineas = textoDeBloque(block);
  const linea = lineas[itemIndex] ?? [];
  const izquierda = fusionar(sliceInlines(linea, 0, offset));
  const derecha = fusionar(sliceInlines(linea, offset, plainLength(linea)));

  switch (block.kind) {
    case "bullets":
    case "ordered":
      return [
        { kind: block.kind, items: [...lineas.slice(0, itemIndex), izquierda] },
        { kind: block.kind, items: [derecha, ...lineas.slice(itemIndex + 1)] }
      ];
    case "todo":
      return [
        {
          kind: "todo",
          items: [...block.items.slice(0, itemIndex), { done: false, content: izquierda }]
        },
        {
          kind: "todo",
          items: [{ done: false, content: derecha }, ...block.items.slice(itemIndex + 1)]
        }
      ];
    case "heading":
      // Lo que hace el iPhone: el título no se propaga a la línea
      // siguiente, que nace como Cuerpo.
      return [{ ...block, content: izquierda }, { kind: "paragraph", content: derecha }];
    case "mono":
      // Sin marcas que cortar: cada mitad es texto llano. Devolver el mismo
      // bloque dos veces (como hacía la versión anterior) lo duplicaría en
      // pantalla en vez de partirlo — quien llama reemplaza el bloque
      // original por estos dos.
      return [
        { kind: "mono", text: textoLlano(izquierda) },
        { kind: "mono", text: textoLlano(derecha) }
      ];
    case "table":
      // Partir una tabla por una celda no tiene un segundo bloque natural
      // (no hay una segunda tabla que crear). La tabla se queda intacta y
      // Enter simplemente abre una línea nueva debajo, como el resto de
      // bloques: un párrafo vacío.
      return [block, { kind: "paragraph", content: [{ kind: "text", text: "" }] }];
    default:
      // Sólo quedan "paragraph" y "quote": ambos tienen `content`.
      return [
        { ...block, content: izquierda },
        { ...block, content: derecha }
      ];
  }
}

/**
 * Backspace al inicio de `b`. Funde la última línea de `a` con la primera de
 * `b`. Devuelve `null` cuando fundir no significa nada — con una tabla o un
 * bloque monoespaciado — en cuyo caso quien llama sólo mueve el foco.
 *
 * Devuelve un ARREGLO de bloques, no uno solo: si a `b` le sobran líneas
 * (sólo puede pasar cuando `b` es una lista), esas líneas no caben en el
 * bloque fundido y se devuelven DETRÁS como un bloque propio — nunca se
 * tiran. Un solo `Block` de vuelta no podría decir «lo fundido MÁS lo que
 * quedó de la lista» sin perder una de las dos partes.
 */
export function mergeBlocks(a: Block, b: Block): Block[] | null {
  if (a.kind === "table" || b.kind === "table") return null;
  if (a.kind === "mono" || b.kind === "mono") return null;

  const lineasA = textoDeBloque(a);
  const lineasB = textoDeBloque(b);
  const ultima = lineasA[lineasA.length - 1] ?? [];
  const primera = lineasB[0] ?? [];
  const fundida = fusionar([...ultima, ...primera]);

  const fundido = conUltimaLinea(a, fundida);
  const sobrante = sobranteDe(b);

  return sobrante ? [fundido, sobrante] : [fundido];
}

/** El bloque `a` que le llega a `mergeBlocks` una vez descartadas tabla y mono. */
type BloqueFundible = Exclude<Block, { kind: "table" } | { kind: "mono" }>;

/** `a` con su última línea reemplazada por `fundida`, conservando su tipo (y el `done` del último ítem si era una lista de casillas). */
function conUltimaLinea(a: BloqueFundible, fundida: Inline[]): Block {
  if (a.kind === "bullets" || a.kind === "ordered") {
    return { kind: a.kind, items: [...a.items.slice(0, -1), fundida] };
  }
  if (a.kind === "todo") {
    const ultimo = a.items[a.items.length - 1];
    return {
      kind: "todo",
      items: [...a.items.slice(0, -1), { done: ultimo?.done ?? false, content: fundida }]
    };
  }
  // Sólo quedan "heading", "paragraph" y "quote": una sola línea.
  return { ...a, content: fundida };
}

/**
 * Lo que le sobra a `b` una vez que su primera línea ya se fundió — como
 * bloque propio, con SU tipo y (si es de casillas) su `done` intacto.
 * `null` si no sobra nada: fundir no debe dejar un bloque vacío detrás.
 */
function sobranteDe(b: Block): Block | null {
  if (b.kind === "bullets" || b.kind === "ordered") {
    const resto = b.items.slice(1);
    return resto.length ? { kind: b.kind, items: resto } : null;
  }
  if (b.kind === "todo") {
    const resto = b.items.slice(1);
    return resto.length ? { kind: "todo", items: resto } : null;
  }
  // "heading", "paragraph" y "quote" sólo tienen una línea: nunca sobra nada.
  return null;
}

/**
 * Los bloques con los que arranca el editor para un cuerpo dado.
 *
 * POR QUÉ NO ES `parseNote` A SECAS
 * `parseNote("")` devuelve `[]` — correcto para el dialecto: un cuerpo vacío no
 * TIENE bloques. Pero el editor pinta un componente editable por bloque, así
 * que con cero bloques una nota nueva se queda sin un solo contenteditable en
 * el cuerpo: se puede escribir el título y nada más. Lo reportó el uso real en
 * un teléfono.
 *
 * El documento vacío es un párrafo vacío, no la nada. La distinción vive aquí y
 * no en `markup.ts` a propósito: el dialecto describe lo que HAY escrito, y el
 * editor necesita además un sitio donde escribir.
 */
export function bloquesEditables(body: string): Block[] {
  const bloques = parseNote(body);
  return bloques.length ? bloques : [{ kind: "paragraph", content: [{ kind: "text", text: "" }] }];
}
