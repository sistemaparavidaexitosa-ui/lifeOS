// src/lib/domain/identity/categorias.ts
// Las categorías de afirmación y su proyección a las áreas de vida — lógica
// pura (probada en tests/domain/identity-categorias.test.ts).
//
// POR QUÉ HAY DOS TAXONOMÍAS Y NO UNA.
//
// Las ÁREAS son estructurales. Vienen de 0064, las comparten `identity_traits`
// y `personal_goals`, y alimentan el radar de Analítica y el componente
// «equilibrio» del Identity Score. Son siete y no se tocan.
//
// Las CATEGORÍAS son de presentación. Existen porque un brief de veinte
// afirmaciones en una lista plana es un muro: agrupadas por «Dinero»,
// «Disciplina» o «Liderazgo» se leen. Son once, viven DENTRO del jsonb de la
// afirmación —sin columna, sin check, sin migración cuando cambien— y no
// agregan nada por sí solas.
//
// El puente entre ambas es `areaDeCategoria`. Todo lo que suma (el área de
// foco, el score, el radar) sigue hablando en las siete de siempre, así que las
// once nunca pueden provocar deriva: son una etiqueta más fina sobre el mismo
// eje, no un eje nuevo.

/** Las siete áreas de vida de 0064. Mismo orden que el check de la base. */
export const AREAS = ["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"] as const;
export type Area = (typeof AREAS)[number];

/**
 * Las once categorías de afirmación, en español porque el producto lo está.
 *
 * El orden NO es alfabético ni casual: es el que usa la pantalla para agrupar,
 * y va de lo exterior (lo que haces y con quién) a lo interior (quién eres y
 * para qué). Leído de arriba abajo cuenta una historia; ordenado por abecedario
 * sería una lista de la compra.
 */
export const CATEGORIAS = [
  "Carrera",
  "Negocio",
  "Dinero",
  "Liderazgo",
  "Relaciones",
  "Salud",
  "Disciplina",
  "Confianza",
  "Aprendizaje",
  "Propósito",
  "Espiritualidad"
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/**
 * A qué área pertenece cada categoría.
 *
 * Las tres agrupaciones que no son obvias, dichas antes de que alguien las
 * cambie sin querer:
 *
 *  - **Negocio y Liderazgo caen en Carrera**, no en Personal. Las dos hablan de
 *    lo que se construye hacia fuera y de la gente a la que se arrastra; el
 *    radar las lee bien juntas con Carrera y mal repartidas.
 *  - **Disciplina y Confianza caen en Personal.** Son el terreno de quién eres
 *    cuando nadie mira, y Personal es justo el área que 0064 dejó para eso.
 *  - **Propósito cae en Espiritual**, no en Personal. El propósito responde
 *    «para qué», que es la pregunta de esa área; Personal responde «cómo».
 */
const AREA_DE: Record<Categoria, Area> = {
  Carrera: "Carrera",
  Negocio: "Carrera",
  Liderazgo: "Carrera",
  Dinero: "Finanzas",
  Relaciones: "Relaciones",
  Salud: "Salud",
  Disciplina: "Personal",
  Confianza: "Personal",
  Aprendizaje: "Aprendizaje",
  Propósito: "Espiritual",
  Espiritualidad: "Espiritual"
};

export function areaDeCategoria(categoria: Categoria): Area {
  return AREA_DE[categoria];
}

/** Sin acentos y en minúsculas, para comparar lo que escribió el modelo. */
function plano(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const POR_NOMBRE = new Map<string, Categoria>(CATEGORIAS.map((c) => [plano(c), c]));

/**
 * La categoría que dijo el modelo, o `null`.
 *
 * Tolera acento perdido y mayúsculas —«Proposito», «PROPÓSITO» y «propósito»
 * son la misma— porque eso es un desliz de transcripción, no una categoría
 * distinta. Lo que NO hace es adivinar: «Éxito» no se parece lo bastante a
 * nada, y devolver `null` deja la afirmación en el grupo «Otras», que es
 * honesto. Inventarle una categoría la escondería en el grupo equivocado.
 */
export function categoriaDe(valor: string | null | undefined): Categoria | null {
  if (!valor) return null;
  return POR_NOMBRE.get(plano(valor)) ?? null;
}

const POR_NOMBRE_AREA = new Map<string, Area>(AREAS.map((a) => [plano(a), a]));

/** Lo mismo para un área. La usa el saneado con `focusArea`. */
export function areaDe(valor: string | null | undefined): Area | null {
  if (!valor) return null;
  return POR_NOMBRE_AREA.get(plano(valor)) ?? null;
}
