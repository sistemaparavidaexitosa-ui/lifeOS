// src/lib/domain/centro/escritura/tarjeta.ts
// De un cambio guardado a lo que la tarjeta enseña (D-203). Puro, probado en
// tests/domain/centro-escritura-tarjeta.test.ts.
//
// LO QUE SE ENSEÑA NO ES LO QUE SE GUARDA. La tarjeta lleva textos para leer
// —recortados y sin marcado, porque el validador del runtime tumba la sección
// entera ante un `<div>`— y `confirmarCambio` guarda el payload de
// `coach_proposals`, intacto. Neutralizar aquí no cambia lo que se escribe.

import type { AnySection } from "../runtime/types.ts";
import type { CampoDeTarjeta, ItemDeCambio } from "../runtime/secciones.ts";
import { ESCRITURA_POR_TABLA, camposDe, type CampoDeEscritura, type EntradaDeEscritura } from "./registro.ts";
import type { CambioGuardado } from "./cambio.ts";

const MAX_TITULO = 90;
const MAX_VALOR = 400;

/** Sin `<` ni `>`: el validador ve «‹div›» como texto, no como etiqueta. */
function paraLeer(v: string, max: number): string {
  const limpio = v.replace(/</g, "‹").replace(/>/g, "›").replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

function comoTexto(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return paraLeer(v, MAX_VALOR);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/** El nombre de la fila a la que apunta una ref, leído en el turno. */
function nombreDeRef(c: CampoDeEscritura, uuid: unknown, filas: ReadonlyMap<string, Record<string, unknown>>): string | null {
  if (typeof uuid !== "string") return null;
  const f = filas.get(`fila:${c.refTabla}:${uuid}`);
  const n = f?.title ?? f?.name;
  return typeof n === "string" && n.trim() ? paraLeer(n, MAX_VALOR) : null;
}

export function tituloDeCambio(c: CambioGuardado): string {
  const e = ESCRITURA_POR_TABLA[c.tabla] as EntradaDeEscritura;
  const fuente = c.operacion === "crear" ? c.campos : { ...(c.antes ?? {}), ...c.campos };
  const principal = fuente[e.titulo];
  // Una nota sin título se titula con su primera línea, como en /notebooks.
  const alterno = c.tabla === "notes" ? fuente.body : null;
  const crudo = typeof principal === "string" && principal.trim() ? principal : typeof alterno === "string" ? alterno.split("\n")[0] ?? "" : "";
  return paraLeer(crudo, MAX_TITULO) || e.etiqueta;
}

function camposDeTarjeta(c: CambioGuardado, filas: ReadonlyMap<string, Record<string, unknown>>): CampoDeTarjeta[] {
  const e = ESCRITURA_POR_TABLA[c.tabla] as EntradaDeEscritura;
  const base = (nombre: string, def: CampoDeEscritura) => ({
    campo: nombre,
    etiqueta: def.etiqueta,
    tipo: def.tipo,
    opciones: def.opciones ? [...def.opciones] : null
  });

  if (c.operacion === "borrar") {
    return Object.entries(e.campos)
      .filter(([n]) => c.antes && c.antes[n] !== undefined && c.antes[n] !== null)
      .map(([n, def]) => ({
        // M1: una ref borrada enseñaba el uuid crudo; el mismo `nombreDeRef`
        // que usa crear, con el mismo `null` de respaldo si esa fila no se
        // leyó en el turno.
        ...base(n, def),
        antes: def.tipo === "ref" ? nombreDeRef(def, c.antes![n], filas) : comoTexto(c.antes![n]),
        despues: null,
        editable: false
      }));
  }

  const permitidos = new Map(camposDe(e, c.operacion));
  return Object.entries(c.campos)
    .filter(([n]) => permitidos.has(n))
    .map(([n, v]) => {
      const def = permitidos.get(n)!;
      const despues = def.tipo === "ref" ? nombreDeRef(def, v, filas) : comoTexto(v);
      const antes = c.operacion === "editar" ? comoTexto(c.antes?.[n]) : null;
      // I1: si `paraLeer` cambió el texto (salto de línea, `<`/`>`, espacios
      // repetidos o recorte a 400), lo que se enseña YA NO ES lo que se
      // guardó — dejarlo editable manda de vuelta el texto mutilado en la
      // primera pulsación de tecla.
      const mutilado = def.tipo === "texto" && typeof v === "string" && paraLeer(v, MAX_VALOR) !== v;
      return { ...base(n, def), antes, despues, editable: def.tipo !== "ref" && !mutilado };
    });
}

export function seccionDeCambios(
  id: string,
  items: { propuestaId: string; cambio: CambioGuardado }[],
  filas: ReadonlyMap<string, Record<string, unknown>>
): AnySection | null {
  if (!items.length) return null;
  const datos: ItemDeCambio[] = items.map(({ propuestaId, cambio }) => ({
    propuestaId,
    operacion: cambio.operacion,
    etiquetaTabla: (ESCRITURA_POR_TABLA[cambio.tabla] as EntradaDeEscritura).etiqueta,
    titulo: tituloDeCambio(cambio),
    campos: camposDeTarjeta(cambio, filas)
  }));
  return { id, kind: "propuestaCambio", data: { items: datos } };
}
