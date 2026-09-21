// src/lib/domain/comando/tipos.ts
// El vocabulario de la capa de navegación del Centro (D-176, reorientado en
// D-177) — puro, sin React ni Supabase.
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

/**
 * Los tres frentes, y lo que la IA intenta mover en cada uno.
 *
 * NO son las secciones de la aplicación: son los tres OBJETIVOS. Un carril
 * puede llevarte a `/planning` o a `/execution` según qué mueva hoy la aguja,
 * y por eso esto es navegación generada y no un menú — el menú se borró en
 * D-169 y no vuelve.
 *
 * El orden del array es el orden en pantalla, y es deliberado: lo que tienes
 * que terminar, luego en quién te estás convirtiendo, luego el dinero. Los tres
 * se ven siempre, aunque uno esté en calma; esconder el que va bien deja a la
 * persona sin saber si es que no hay nada o es que no se miró.
 */
export const CARRILES = ["execution", "development", "money"] as const;

export type Carril = (typeof CARRILES)[number];

export const CARRIL_NOMBRE: Record<Carril, string> = {
  execution: "Execution OS",
  development: "Personal Development OS",
  money: "Money OS"
};

/** Para qué existe cada carril. Se pinta pequeño, debajo del nombre. */
export const CARRIL_OBJETIVO: Record<Carril, string> = {
  execution: "Terminar lo que empezaste",
  development: "Acercarte a quien quieres ser",
  money: "Cumplir tus metas de dinero"
};

/** A dónde lleva el carril cuando no hay nada urgente que hacer en él. */
export const CARRIL_INICIO: Record<Carril, string> = {
  execution: "/execution",
  development: "/development",
  money: "/money"
};

/** Una cosa que el centro te está pidiendo. */
export interface ItemDeMando {
  /** En qué frente cuenta. Lo asigna `componer.ts`, no el modelo. */
  carril: Carril;
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
  /** Cuántas cosas te frenan, en los tres frentes. Cero se dice, no se esconde. */
  bloqueos: number;
}

/** Un frente, con lo que toca en él o con el estado en que está. */
export interface CarrilDelCentro {
  carril: Carril;
  /** Lo más consecuente ahora en este frente. `null` = está en calma. */
  item: ItemDeMando | null;
  /**
   * Qué decir cuando no hay nada urgente. NUNCA vacío y nunca inventado: sale
   * de cifras que ya existen («8 días de quincena», «3 tareas abiertas»). Un
   * carril en calma sigue siendo navegación —te dice dónde estás y te deja
   * entrar—, no un hueco.
   */
  estado: string;
  /** A dónde entrar en este frente. */
  href: string;
  destino: string;
}

export interface Mando {
  estado: EstadoDeMando;
  /**
   * Todo lo accionable, en orden de caducidad, mezclando los tres frentes.
   *
   * SE ENSEÑA DE UNO EN UNO (D-180). Enseñar los tres frentes a la vez fue el
   * error de D-177: tres encabezados simultáneos son el panel que D-169 mató,
   * solo que con mejor tipografía. Los tres objetivos se cubren a lo largo de
   * la sesión —«Ahora no» trae el siguiente, que puede ser de otro frente— no
   * en la misma pantalla.
   */
  items: ItemDeMando[];
  /**
   * Cómo está cada frente. Solo se usa AL FINAL, cuando ya no queda nada que
   * hacer: el cierre ofrece las tres entradas para que se pueda navegar sin
   * tener nada pendiente.
   */
  frentes: CarrilDelCentro[];
  /** Qué decir cuando no queda nada. Nunca se inventa trabajo. */
  cierre: string;
}
