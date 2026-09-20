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
import {
  CARRILES,
  CARRIL_INICIO,
  type Carril,
  type CarrilDelCentro,
  type Categoria,
  type EstadoDeMando,
  type ItemDeMando,
  type Mando
} from "./tipos.ts";

/**
 * Lo que el centro necesita saber, además de lo que ya pide el lienzo.
 *
 * Extiende `EntradaLienzo` en vez de copiar sus campos: así, el día que el
 * lienzo gane un dato, éste lo hereda y el compilador avisa a quien construye
 * la entrada. Lo añadido es **estado**, no acciones — por eso solo alimenta la
 * cabecera y nunca produce un ítem.
 */
export interface EntradaDeMando extends EntradaLienzo {
  /**
   * Lo que hace falta para que un carril en calma diga algo verdadero.
   *
   * Son cifras que YA existen en el contenido del centro; ninguna se calcula
   * aquí ni se le pregunta al modelo. Un carril sin señales dice lo genérico y
   * sigue llevándote a su sitio: es peor callar que decir menos.
   */
  senalesDeCarril: {
    /** Las del plan de hoy. NO son «todas las abiertas»: el contenido del
     *  centro no las trae, y decir una cifra por otra es cómo se pierde la
     *  confianza en una pantalla que presume de saber. */
    tareasDelPlan: number;
    habitosPendientes: number;
    identidadDeclarada: boolean;
  };
}

/**
 * En qué frente cuenta cada tipo de propuesta.
 *
 * Espejo del `check` de `coach_proposals.tipo`. `rutina` y `meta` van a
 * desarrollo personal porque es donde viven —`routines` y `personal_goals`—, y
 * `arista` a ejecución porque el grafo se usa para desatascar proyectos.
 */
const CARRIL_POR_TIPO: Record<string, Carril> = {
  tarea: "execution",
  bloque: "execution",
  estructura: "execution",
  arista: "execution",
  foco: "execution",
  rutina: "development",
  meta: "development",
  nota: "development"
};

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

/**
 * A qué frente pertenece una tarjeta.
 *
 * El hábito es desarrollo personal aunque se marque en dos segundos: lo que
 * mueve no es la tarea, es el voto por el rasgo (`habit_identity_traits`, 0064).
 * Las vencidas y la Única Cosa son ejecución. El dinero, dinero.
 */
function carrilDe(t: Tarjeta, e: EntradaDeMando): Carril {
  switch (t.kind) {
    case "habito":
      return "development";
    case "dinero":
      return "money";
    case "vencidas":
    case "unicaCosa":
      return "execution";
    case "propuesta": {
      const propuesta = e.propuestas.find((p) => p.id === t.propuestaId);
      return (propuesta && CARRIL_POR_TIPO[propuesta.tipo]) ?? "execution";
    }
    case "apertura":
    case "cierre":
      // El resumen y el cierre no son de ningún frente: van a la cabecera.
      return "execution";
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
  return {
    id: t.id,
    carril: carrilDe(t, e),
    categoria: categoriaDe(t, e),
    voz: t.voz,
    titulo: t.titulo,
    accion,
    href,
    datos
  };
}

/**
 * Qué decir de un frente que no tiene nada urgente.
 *
 * Nunca «todo bien» a secas: eso no se puede comprobar y suena a relleno. Se
 * dice lo que SÍ se sabe, con su cifra, y se ofrece entrar igualmente — un
 * carril en calma sigue siendo navegación.
 */
function estadoDeCalma(carril: Carril, e: EntradaDeMando): { estado: string; destino: string } {
  const s = e.senalesDeCarril;
  if (carril === "execution") {
    return s.tareasDelPlan > 0
      ? {
          estado: `${s.tareasDelPlan} ${s.tareasDelPlan === 1 ? "tarea" : "tareas"} en tu plan de hoy, nada vencido`,
          destino: "Ver el tablero"
        }
      : { estado: "Nada vencido y sin plan para hoy", destino: "Abrir Ejecución" };
  }
  if (carril === "development") {
    if (s.habitosPendientes > 0) {
      return { estado: `${s.habitosPendientes} ${s.habitosPendientes === 1 ? "hábito pendiente" : "hábitos pendientes"} hoy`, destino: "Ver rutinas" };
    }
    return s.identidadDeclarada
      ? { estado: "Tus hábitos de hoy están hechos", destino: "Ver tu identidad" }
      : { estado: "Aún no dices en quién quieres convertirte", destino: "Escribirlo" };
  }
  return e.diasParaFinDeQuincena > 0
    ? { estado: `${e.diasParaFinDeQuincena} ${e.diasParaFinDeQuincena === 1 ? "día" : "días"} de quincena, presupuesto en verde`, destino: "Ver Dinero" }
    : { estado: "Presupuesto en verde", destino: "Ver Dinero" };
}

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
  // separa: es el texto del día vacío, no una cosa más que hacer. La apertura
  // tampoco entra: su sitio es la cabecera, como resumen.
  const cierre = tarjetas.find((t) => t.kind === "cierre");
  const accionables = tarjetas
    .filter((t) => t.kind !== "cierre" && t.kind !== "apertura")
    .map((t) => itemDe(t, e));

  // UN SOLO ÍTEM POR CARRIL, Y ES EL PRIMERO. Como `accionables` ya viene en el
  // orden de caducidad de D-169, quedarse con el primero de cada frente
  // significa que dentro del carril manda el mismo criterio de siempre. Lo que
  // no cabe no se pierde: sigue ahí cuando se resuelva o se aparte lo de
  // encima. Tres cosas a la vista y no nueve es lo que impide que esto vuelva a
  // ser la bandeja que D-169 mató.
  const carriles: CarrilDelCentro[] = CARRILES.map((carril) => {
    const item = accionables.find((i) => i.carril === carril) ?? null;
    if (item) return { carril, item, estado: "", href: item.href ?? CARRIL_INICIO[carril], destino: item.accion ?? "Abrir" };
    const calma = estadoDeCalma(carril, e);
    return { carril, item: null, estado: calma.estado, href: CARRIL_INICIO[carril], destino: calma.destino };
  });

  // El que manda es el del ítem más urgente de todos, no un orden fijo: si hoy
  // lo que aprieta es el dinero, el dinero manda aunque se pinte el tercero.
  const dominante = accionables[0]?.carril ?? null;

  const estado: EstadoDeMando = {
    resumen: e.resumen,
    bloqueos: accionables.filter((i) => i.categoria === "bloquear").length
  };

  return { estado, carriles, dominante, cierre: cierre?.titulo ?? "Ya está. ¿Algo más?" };
}
