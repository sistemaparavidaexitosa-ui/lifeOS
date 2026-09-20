// src/lib/domain/comando/componer.ts
// De los datos del día a lo que el centro te pide (D-176) — puro, probado en
// tests/domain/comando-componer.test.ts.
//
// EL PRINCIPIO: EL CENTRO NO INVENTA PRIORIDADES, PRESENTA LAS QUE YA EXISTEN
//
// `tarjetasDelCentro()` (domain/centro/lienzo.ts) ya decide qué merece pedirse
// hoy y en qué orden —el de **lo que caduca antes**—, y lleva catorce casos de
// prueba desde D-169. Este archivo NO vuelve a decidirlo: llama a esa misma
// función y se limita a repartir lo que devuelve en tres sitios de la pantalla.
//
// Es la diferencia entre evolucionar el centro y escribir un tercer criterio de
// prioridad en el repositorio. Lo que D-176 revierte de D-169 es la regla de
// «una sola tarjeta a la vista»; el criterio con el que se ordenan, no.
//
// LO QUE SÍ SE DECIDE AQUÍ, Y SOLO ESTO
//  1. De qué CATEGORÍA es cada tarjeta (las siete de tipos.ts).
//  2. Cuál es el foco: la primera que no sea el cierre.
//  3. Qué se considera un bloqueo, para sacarlo aparte.
// Las tres son deterministas y ninguna consulta al modelo.

import { tarjetasDelCentro, type EntradaLienzo, type Tarjeta } from "../centro/lienzo.ts";
import type { Categoria, EstadoDeMando, ItemDeMando, Mando } from "./tipos.ts";

/**
 * Lo que el centro necesita saber, además de lo que ya pide el lienzo.
 *
 * Extiende `EntradaLienzo` en vez de copiar sus campos: así, el día que el
 * lienzo gane un dato, éste lo hereda y el compilador avisa a quien construye
 * la entrada. Lo añadido es **estado**, no acciones — por eso solo alimenta la
 * cabecera y nunca produce un ítem.
 */
export interface EntradaDeMando extends EntradaLienzo {
  planAprobado: boolean;
  saturacion: "ok" | "warn" | "saturated";
  minutosComprometidos: number;
  minutosDisponibles: number;
}

/**
 * De qué tipo de propuesta se trata, en categoría.
 *
 * Los tipos vienen del `check` de `coach_proposals.tipo` en la base (0053, 0062
 * y 0070), así que esta tabla es su espejo. Un tipo nuevo cae en `ejecutar`,
 * que es el caso mayoritario y el menos dañino si se acierta mal: pedir que
 * hagas algo que en realidad había que decidir molesta menos que al revés.
 */
const CATEGORIA_POR_TIPO: Record<string, Categoria> = {
  tarea: "ejecutar",
  bloque: "ejecutar",
  rutina: "ejecutar",
  foco: "ejecutar",
  meta: "decidir",
  estructura: "decidir",
  arista: "decidir",
  nota: "recordar"
};

/**
 * La categoría de una tarjeta.
 *
 * `dinero` es el caso interesante: cuando el presupuesto está en rojo ya no es
 * algo que revisar, es algo que te frena —gastar de más condiciona todo lo
 * demás del quincena—. Por eso su categoría depende del estado, no solo del
 * tipo.
 */
function categoriaDe(t: Tarjeta, e: EntradaDeMando): Categoria {
  switch (t.kind) {
    case "habito":
    case "unicaCosa":
      return "ejecutar";
    case "vencidas":
      return "bloquear";
    case "dinero":
      return e.presupuestoEnRojo ? "bloquear" : "revisar";
    case "propuesta": {
      // `Tarjeta` no arrastra el tipo de la propuesta —solo su id— así que se
      // busca en la entrada. La alternativa era añadirle un campo a `Tarjeta`,
      // y ese tipo lo gobierna D-169 con catorce pruebas encima: cambiar un
      // archivo probado para ahorrarse un `find` es mal negocio.
      const propuesta = e.propuestas.find((p) => p.id === t.propuestaId);
      return (propuesta && CATEGORIA_POR_TIPO[propuesta.tipo]) ?? "ejecutar";
    }
    case "apertura":
      return "revisar";
    case "cierre":
      return "revisar";
  }
}

/** El texto del botón y a dónde lleva, según el tipo de tarjeta. */
function accionDe(t: Tarjeta): { accion: string | null; href: string | null; datos: ItemDeMando["datos"] } {
  switch (t.kind) {
    case "habito":
      return { accion: null, href: null, datos: { tipo: "habito", routineId: t.routineId, habitId: t.habitId } };
    case "propuesta":
      return { accion: t.accion, href: t.href, datos: { tipo: "propuesta", propuestaId: t.propuestaId } };
    case "unicaCosa":
      return { accion: "Ir a planeación", href: "/planning", datos: { tipo: "navegar" } };
    case "dinero":
    case "vencidas":
      return { accion: "Abrir", href: t.href, datos: { tipo: "navegar" } };
    case "apertura":
    case "cierre":
      return { accion: null, href: null, datos: { tipo: "aviso" } };
  }
}

function itemDe(t: Tarjeta, e: EntradaDeMando): ItemDeMando {
  const { accion, href, datos } = accionDe(t);
  return { id: t.id, categoria: categoriaDe(t, e), voz: t.voz, titulo: t.titulo, accion, href, datos };
}

const minutosAHoras = (m: number): number => Math.round((m / 60) * 10) / 10;

/**
 * Lo que el centro te pide hoy, repartido en pantalla.
 *
 * `pospuestas` son los ids que apartaste con «Ahora no». Se pasan tal cual a
 * `tarjetasDelCentro`, que ya sabe bajarlos al final sin duplicarlos: apartar
 * algo no lo borra, y esa regla de D-169 se conserva entera.
 */
export function componerMando(e: EntradaDeMando, pospuestas: readonly string[] = []): Mando {
  const tarjetas = tarjetasDelCentro(e, [...pospuestas]);

  // `tarjetasDelCentro` SIEMPRE cierra con la tarjeta de cierre. Aquí se
  // separa: es el texto del día vacío, no una cosa más que hacer.
  const cierre = tarjetas.find((t) => t.kind === "cierre");
  const accionables = tarjetas.filter((t) => t.kind !== "cierre").map((t) => itemDe(t, e));

  const bloqueos = accionables.filter((i) => i.categoria === "bloquear");
  const resto = accionables.filter((i) => i.categoria !== "bloquear");

  // EL FOCO NO SALE DE LOS BLOQUEOS, y es deliberado. Lo que te frena ya tiene
  // su propio sitio con su propio peso visual; si además ocupara el hueco de
  // «hoy deberías», un día con dos tareas vencidas te diría que tu única
  // prioridad es ponerte al día, que es justo lo contrario de avanzar.
  const [foco = null, ...siguientes] = resto;

  const estado: EstadoDeMando = {
    resumen: e.resumen,
    bloqueos: bloqueos.length,
    horasComprometidas: minutosAHoras(e.minutosComprometidos),
    horasDisponibles: minutosAHoras(e.minutosDisponibles),
    saturacion: e.saturacion,
    planAprobado: e.planAprobado
  };

  return {
    estado,
    foco,
    bloqueos,
    siguientes,
    cierre: cierre?.titulo ?? "Ya está. ¿Algo más?"
  };
}
