// src/lib/domain/comando/tipos.ts
// El vocabulario del centro de mando (D-176) — puro, sin React ni Supabase.
//
// POR QUÉ EXISTE
// El centro dejó de ser un tablero de secciones para convertirse en algo que
// dice qué hacer. Para eso hace falta una palabra que el tablero no necesitaba:
// **de qué TIPO es lo que te está pidiendo**. No es lo mismo «ejecuta esto» que
// «decide esto» o «esto te está frenando», y hasta ahora todo se pintaba igual.
//
// LAS CATEGORÍAS SE DERIVAN, NO SE PIDEN AL MODELO
// Podría preguntársele al modelo qué categoría es cada cosa, y acertaría casi
// siempre. Pero la regla de la casa —la que hace que `validateAnchoring` exista—
// es que el modelo redacta y no calcula. Una etiqueta que inventa el modelo no
// se puede probar, y esta gobierna qué se pinta arriba y qué abajo.
//
// Así que salen de `componer.ts`, con una función pura y una suite.

/**
 * Las siete categorías, EN SU ORDEN DE URGENCIA.
 *
 * El orden importa: cuando dos ítems empatan en caducidad, manda este array.
 * `bloquear` primero porque lo que te frena no espera; `investigar` al final
 * porque es lo único que nunca es urgente.
 */
export const CATEGORIAS = [
  "bloquear",
  "ejecutar",
  "decidir",
  "revisar",
  "recordar",
  "delegar",
  "investigar"
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export function esCategoria(v: string): v is Categoria {
  return (CATEGORIAS as readonly string[]).includes(v);
}

/** Cómo se llama cada una en pantalla. En imperativo: es lo que TÚ harías. */
export const ETIQUETA: Record<Categoria, string> = {
  bloquear: "Te frena",
  ejecutar: "Ejecuta",
  decidir: "Decide",
  revisar: "Revisa",
  recordar: "Recuerda",
  delegar: "Delega",
  investigar: "Investiga"
};

// El TONO y el ICONO de cada categoría NO viven aquí: son presentación, y
// tenerlos en el dominio obligaría a importar `components/icons.tsx` desde
// `domain/`, invirtiendo las capas —cosa que no hace ningún otro archivo de
// `domain/`—. Están en `src/components/comando/categoria.ts`, junto a quien los
// pinta, y el compilador obliga a que cubran las siete.

/** Una cosa que el centro te está pidiendo. */
export interface ItemDeMando {
  /** El mismo id que la `Tarjeta` de la que sale: estable entre repintados. */
  id: string;
  categoria: Categoria;
  /** El porqué, en versalitas y arriba. Puede ir vacío. */
  voz: string;
  /** Qué harías, en imperativo. Es el texto grande. */
  titulo: string;
  /** El texto del botón. `null` = no hay nada que pulsar. */
  accion: string | null;
  /** A dónde lleva, si lleva a algún sitio. */
  href: string | null;
  /**
   * Lo que hace falta para resolverlo sin salir del centro. Se conserva tal
   * cual viene de `Tarjeta` para que la UI no tenga que volver a deducirlo.
   */
  datos:
    | { tipo: "habito"; routineId: string; habitId: string }
    | { tipo: "propuesta"; propuestaId: string }
    | { tipo: "navegar" }
    | { tipo: "aviso" };
}

/**
 * El estado de la persona ahora mismo. NO son acciones.
 *
 * Vive separado de los ítems porque son dos preguntas distintas: «qué hago» y
 * «cómo voy». Mezclarlas es exactamente cómo el centro volvió a parecer un
 * tablero la última vez (D-168 → D-169).
 */
export interface EstadoDeMando {
  /** El resumen de la franja, si lo hay. Vacío = no se inventa uno. */
  resumen: string;
  /** Cuántas cosas te frenan. Cero se dice, no se esconde. */
  bloqueos: number;
  horasComprometidas: number;
  horasDisponibles: number;
  saturacion: "ok" | "warn" | "saturated";
  /** El plan del día está aprobado. */
  planAprobado: boolean;
}

export interface Mando {
  estado: EstadoDeMando;
  /** La acción dominante. `null` en un día sin nada que pedir. */
  foco: ItemDeMando | null;
  /** Lo que te frena, aparte. Vacío = la sección no se pinta. */
  bloqueos: ItemDeMando[];
  /** El resto, en orden de caducidad, sin el foco ni los bloqueos. */
  siguientes: ItemDeMando[];
  /** Qué decir cuando no queda nada. Nunca se inventa trabajo. */
  cierre: string;
}
