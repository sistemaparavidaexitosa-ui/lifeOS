// src/lib/domain/centro/interprete/vocabulario.ts
// Los verbos, las señales de «esto pide pensar» y los destinos (D-205). Puro,
// probado en tests/domain/centro-interprete-analizar.test.ts.
//
// Las PALABRAS DE CADA TABLA no viven aquí: están en `ESCRITURA_POR_TABLA`
// (`sinonimos`), junto a sus campos, para que una tabla nueva no pueda entrar
// sin su vocabulario. Aquí solo lo que es de todas.

import { NAV_ITEMS } from "../../../../components/nav-items.ts";
import type { Operacion, TablaEscribible } from "../escritura/registro.ts";
import { comoPalabra, normalizar } from "./normalizar.ts";

/** Ya normalizados. Con pronombre pegado («agrégame») cuenta igual. */
export const VERBOS: Record<Operacion, readonly string[]> = {
  crear: [
    "crea", "creame", "crear", "agrega", "agregame", "agregar", "anade", "anademe", "anadir",
    "anota", "anotame", "anotar", "apunta", "apuntame", "apuntar", "registra", "registrame", "registrar",
    "nueva", "nuevo", "haz", "hazme"
  ],
  editar: [
    "cambia", "cambiale", "cambiar", "mueve", "muevele", "mover", "marca", "marcame", "marcar",
    "pasa", "pon", "ponle", "actualiza", "actualizar", "renombra", "renombrar", "pospon", "posponer"
  ],
  borrar: ["borra", "borrame", "borrar", "elimina", "eliminame", "eliminar", "quita", "quitame", "quitar"]
};

/**
 * Verbos que YA dicen la tabla y un valor: «desayuné» es crear una comida en
 * el desayuno; «termina» es poner una tarea en hecha.
 */
export const VERBOS_DE_TABLA: Readonly<Record<string, { operacion: Operacion; tabla: TablaEscribible; valores: Record<string, string> }>> = {
  desayune: { operacion: "crear", tabla: "food_entries", valores: { meal: "Desayuno" } },
  almorce: { operacion: "crear", tabla: "food_entries", valores: { meal: "Almuerzo" } },
  cene: { operacion: "crear", tabla: "food_entries", valores: { meal: "Cena" } },
  completa: { operacion: "editar", tabla: "tasks", valores: { status: "Completed" } },
  termina: { operacion: "editar", tabla: "tasks", valores: { status: "Completed" } },
  termine: { operacion: "editar", tabla: "tasks", valores: { status: "Completed" } },
  recuerdame: { operacion: "crear", tabla: "reminders", valores: {} },
  recuerdamelo: { operacion: "crear", tabla: "reminders", valores: {} },
  gaste: { operacion: "crear", tabla: "journal_entries", valores: { type: "expense" } },
  pague: { operacion: "crear", tabla: "journal_entries", valores: { type: "expense" } },
  compre: { operacion: "crear", tabla: "journal_entries", valores: { type: "expense" } },
  cobre: { operacion: "crear", tabla: "journal_entries", valores: { type: "income" } },
  recibi: { operacion: "crear", tabla: "journal_entries", valores: { type: "income" } },
  gane: { operacion: "crear", tabla: "journal_entries", valores: { type: "income" } },
  peso: { operacion: "crear", tabla: "body_measurements", valores: {} },
  pese: { operacion: "crear", tabla: "body_measurements", valores: {} },
  comenta: { operacion: "crear", tabla: "comments", valores: {} },
  comentale: { operacion: "crear", tabla: "comments", valores: {} }
};

/**
 * Lo que pide criterio, no manos: preguntar, analizar, aconsejar. Eso es el
 * «verdadero valor» que la persona quiere dejarle a la IA, así que el
 * intérprete ni lo intenta.
 */
const PIDE_CRITERIO = [
  "por que", "como voy", "como va", "como estoy", "cuanto", "cuanta", "cuantos", "cuantas",
  "analiza", "analizame", "recomienda", "recomiendame", "consejo", "aconseja", "aconsejame",
  "deberia", "opinas", "resume", "resumeme", "resumen", "compara", "planea", "planeame", "plan para",
  "estrategia", "ayudame a pensar", "que hago", "que me falta", "explica", "explicame"
];

export function pideCriterio(original: string, n: string): boolean {
  if (/[¿?]/.test(original)) return true;
  return PIDE_CRITERIO.some((f) => comoPalabra(f).test(n));
}

const IR = ["abre", "abrir", "abreme", "ve a", "ir a", "vamos a", "llevame a", "muestrame", "ensename", "navega a"];
const RELLENO_DE_DESTINO = /^(?:(?:la|el|las|los|mi|mis|pantalla|seccion|de|del|a)\s+)+/;

/** Palabras con que se nombra una sección que no son su rótulo del menú. */
const ALIAS: Readonly<Record<string, string>> = {
  inicio: "/home",
  dinero: "/money",
  gastos: "/money",
  finanzas: "/money",
  presupuesto: "/money/budget",
  habitos: "/development/routines",
  rutinas: "/development/routines",
  metas: "/development/goals",
  libros: "/development/library",
  biblioteca: "/development/library",
  nutricion: "/development/nutrition",
  comidas: "/development/nutrition",
  proyectos: "/execution",
  tareas: "/execution",
  deudas: "/debt",
  ahorros: "/savings",
  inversiones: "/investments",
  patrimonio: "/wealth",
  configuracion: "/settings",
  ajustes: "/settings",
  planeacion: "/planning",
  tiempo: "/time",
  reportes: "/reports"
};

/**
 * «Llévame a presupuesto» → `/money/budget`. Solo con un verbo de ir al
 * principio y una sección que se nombra ENTERA: «abre mis tareas de hoy» no
 * es un destino, es una pregunta.
 */
export function destinoDe(n: string): { href: string; etiqueta: string } | null {
  const verbo = IR.find((v) => n === v || n.startsWith(`${v} `));
  if (!verbo) return null;
  const resto = n.slice(verbo.length).trim().replace(RELLENO_DE_DESTINO, "").trim();
  if (!resto) return null;
  const visibles = NAV_ITEMS.filter((i) => !i.hidden);
  const href = ALIAS[resto] ?? visibles.find((i) => normalizar(i.label) === resto)?.href;
  const item = href ? visibles.find((i) => i.href === href) : undefined;
  return item ? { href: item.href, etiqueta: item.label } : null;
}
