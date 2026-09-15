// Claves de React para los bloques y las líneas del editor de notas (D-157).
//
// POR QUÉ HACEN FALTA
// Con `key={índice}`, Enter partía la línea y le pedía al navegador que moviera
// el foco al contenteditable de abajo. En Chromium y en WebKit de escritorio eso
// funciona; en el iPhone, no: aparecía la línea nueva, el cursor se quedaba
// arriba y lo que se escribía caía en la línea anterior.
//
// La salida es no mover el foco. Si la línea donde QUEDA el cursor conserva la
// clave de la línea donde se pulsó, React conserva el MISMO nodo —el que ya
// tiene el foco y el teclado— y sólo inserta o quita el de al lado. El cursor
// se recoloca dentro del nodo que ya estaba enfocado, y eso iOS sí lo respeta.
//
// Cuando el bloque cambia de etiqueta (un encabezado que abre un párrafo, una
// lista que se funde con un párrafo), React tiene que crear otro nodo de todos
// modos. Ahí no se intenta conservar nada y el foco se mueve como antes.
//
// Todo es puro: entra la lista de claves de antes y sale la de después.
import type { Block } from "./markup.ts";
import { textoDeBloque } from "./edit.ts";

export interface Claves {
  /** Una por bloque, en el orden de `blocks`. */
  bloques: string[];
  /** Por bloque, una por línea (`textoDeBloque`). Sólo las listas las usan. */
  items: string[][];
}

type Generador = () => string;

/** Bloques de una sola línea cuyo nodo se puede reutilizar para otro bloque igual. */
const REUTILIZABLES = new Set<Block["kind"]>(["paragraph", "quote", "mono"]);

function insertar<T>(arr: T[], i: number, valor: T): T[] {
  return [...arr.slice(0, i), valor, ...arr.slice(i)];
}

function quitar<T>(arr: T[], i: number): T[] {
  return arr.filter((_, j) => j !== i);
}

/**
 * Deja una clave por bloque y por línea, conservando las que ya había por
 * posición. Es la red para todo lo que no pasa por las funciones de abajo —un
 * deshacer, un cambio de estilo—, que es exactamente el comportamiento que
 * tenían las claves por índice.
 */
export function alinearClaves(c: Claves, blocks: Block[], nueva: Generador): Claves {
  const bloques = c.bloques.slice(0, blocks.length);
  while (bloques.length < blocks.length) bloques.push(nueva());
  const items = blocks.map((b, i) => {
    const n = textoDeBloque(b).length;
    const lineas = (c.items[i] ?? []).slice(0, n);
    while (lineas.length < n) lineas.push(nueva());
    return lineas;
  });
  return { bloques, items };
}

/** Enter en la línea `ii` del bloque `bi`; `resultado` es lo que devolvió `partirConEnter`. */
export function clavesTrasEnter(
  c: Claves,
  bi: number,
  ii: number,
  original: Block,
  resultado: Block[],
  nueva: Generador
): Claves {
  // La lista sigue siendo una: el ítem nuevo (abajo) hereda la clave.
  if (resultado.length === 1) {
    return { bloques: c.bloques, items: c.items.map((it, i) => (i === bi ? insertar(it, ii, nueva()) : it)) };
  }
  const [a, b] = resultado;
  const reutiliza = REUTILIZABLES.has(original.kind) && a?.kind === original.kind && b?.kind === original.kind;
  if (reutiliza) {
    // El bloque de arriba es el nuevo; el de abajo se queda la clave (y el nodo).
    return { bloques: insertar(c.bloques, bi, nueva()), items: insertar(c.items, bi, [nueva()]) };
  }
  return { bloques: insertar(c.bloques, bi + 1, nueva()), items: insertar(c.items, bi + 1, [nueva()]) };
}

/** Enter en un ítem vacío: sale de la lista. `quedaLista` = a la lista le quedan ítems. */
export function clavesTrasSalirDeLista(
  c: Claves,
  bi: number,
  ii: number,
  quedaLista: boolean,
  nueva: Generador
): Claves {
  if (!quedaLista) {
    return {
      bloques: c.bloques.map((k, i) => (i === bi ? nueva() : k)),
      items: c.items.map((it, i) => (i === bi ? [nueva()] : it))
    };
  }
  const items = c.items.map((it, i) => (i === bi ? quitar(it, ii) : it));
  return { bloques: insertar(c.bloques, bi + 1, nueva()), items: insertar(items, bi + 1, [nueva()]) };
}

/** Backspace al inicio de la línea `ii > 0`: se funde con la anterior del mismo bloque. */
export function clavesTrasFundirLinea(c: Claves, bi: number, ii: number): Claves {
  // Se quita la clave de ARRIBA: la línea fundida se queda la de abajo, que es
  // la que tiene el foco.
  return { bloques: c.bloques, items: c.items.map((it, i) => (i === bi ? quitar(it, ii - 1) : it)) };
}

/** Backspace al inicio del bloque `bi`; `fundido` es lo que devolvió `mergeBlocks`. */
export function clavesTrasFundirBloques(c: Claves, bi: number, bloque: Block, fundido: Block[]): Claves {
  const [primero] = fundido;
  if (fundido.length === 1 && primero && primero.kind === bloque.kind && REUTILIZABLES.has(bloque.kind)) {
    return { bloques: quitar(c.bloques, bi - 1), items: quitar(c.items, bi - 1) };
  }
  if (fundido.length === 2) {
    // A la lista le sobraron ítems: siguen detrás, con su clave, sin el primero.
    return { bloques: c.bloques, items: c.items.map((it, i) => (i === bi ? it.slice(1) : it)) };
  }
  return { bloques: quitar(c.bloques, bi), items: quitar(c.items, bi) };
}
