// src/lib/domain/ai/tools.ts
// Las reglas que se le aplican a lo que PIDE el modelo cuando usa una
// herramienta. Puro, sin Supabase: lo impuro vive en `src/lib/ai/tools.ts`.
//
// Los argumentos de una llamada a herramienta son texto generado por un
// modelo, no un formulario validado. Aquí no se confía en ninguno.

import { MAX_FILAS_CONSULTA, dominioDeTabla, type TablaConsultableNombre } from "../../insights/context.ts";
import type { Domain } from "../insights/types.ts";
import { addDaysISO } from "../datetime.ts";

/**
 * Ventana máxima que se puede pedir de una vez.
 *
 * Poco más de un año: cubre «compáralo con el año pasado», que es la pregunta
 * más ancha que alguien hace de verdad, y deja fuera el «tráete todo» que
 * llenaría el prompt con filas que nadie va a leer.
 */
export const MAX_DIAS_CONSULTA = 400;

/**
 * El subconjunto de OpenAPI 3.0 que admite `responseSchema`.
 *
 * Se declara en vez de aceptar `unknown` para que un campo que la API no
 * entiende se caiga en `tsc` y no en producción. Dos ausencias que sorprenden
 * y por eso se nombran: **no existe `additionalProperties`** (el modo es
 * estricto de todas formas) y `propertyOrdering` no es decorativo — sin él el
 * orden de las claves puede bailar entre llamadas idénticas.
 *
 * VIVE AQUÍ, Y NO EN `src/lib/ai/gemini-provider.ts`, DESDE D-173. Es un tipo
 * puro que describe un formato de wire: estaba en la capa de efectos por
 * costumbre, no porque tuviera nada de servidor. Mientras estuvo allí —detrás
 * de `server-only`— el dominio no podía nombrar una herramienta, y por tanto no
 * podía existir un agente que usara herramientas. El proveedor lo reexporta.
 */
export interface GeminiSchema {
  /**
   * EN MAYÚSCULAS, y no es cosmético: el cuerpo se parsea como JSON de
   * protobuf, donde un valor de enum se casa por su NOMBRE exacto. `"string"`
   * en minúscula no es el nombre de nada y se rechaza con un 400 antes de
   * llegar al modelo.
   */
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  description?: string;
  enum?: string[];
  /** `"enum"` acompaña siempre a un `enum` de tipo STRING; es la forma documentada. */
  format?: string;
  nullable?: boolean;
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  propertyOrdering?: string[];
}

/**
 * Una herramienta declarada al modelo. `parameters` reusa `GeminiSchema` —el
 * mismo dialecto de `responseSchema`— porque es el mismo subconjunto de
 * OpenAPI: dos tipos para la misma forma sería una deriva esperando a pasar.
 */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: GeminiSchema;
}

/**
 * Lo que se le puede entregar al modelo para que pida datos por su cuenta.
 *
 * Es solo la FORMA. Quien la construye —con Supabase, la lista blanca de tablas
 * y los dominios ya intersecados— es `crearCajaDeHerramientas()` en
 * `src/lib/ai/tools.ts`, que sigue llevando `server-only` y no se movió.
 * Separar la forma de la fábrica es lo que permite que `AgentInput` ofrezca
 * herramientas a un agente sin que el contrato de los agentes dependa de la
 * capa que habla con la base (D-173).
 */
export interface CajaDeHerramientas {
  declaraciones: FunctionDeclaration[];
  ejecutar: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  /**
   * Los id que el modelo SÍ puede citar porque se los dimos por herramienta.
   * Quien valida las citas tiene que unirlos a los del contexto: si no, todo
   * lo que el modelo pidió se le descartaría por «inventado».
   */
  entregados: () => Set<string>;
  /**
   * Las filas que `consultar` entregó, con sus valores (D-194). El agente de
   * interfaz cita `fila:<tabla>:<id>` + columna y el servidor lee el valor de
   * aquí: lo que no se entregó en este turno no se puede enseñar.
   */
  filasEntregadas: () => ReadonlyMap<string, Record<string, unknown>>;
  /**
   * Lo que se buscó en internet, textual. Va a `audit_log`: sin esto, «salió
   * una consulta hacia Google» y «salió QUÉ hacia Google» se ven igual, y solo
   * la segunda permite comprobar que no viajaron datos del usuario.
   */
  busquedas: () => string[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Una fecha ISO que además EXISTE: `2026-13-45` cumple el patrón y no es un día. */
function esFecha(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export type Ventana = { ok: true; desde: string; hastaExclusivo: string } | { ok: false; reason: string };

/**
 * La ventana de fechas de una consulta, saneada.
 *
 * **El final es EXCLUSIVO**, y no es un detalle de estilo: las columnas de la
 * lista blanca son unas `date` y otras `timestamptz`. Un `lte` contra un
 * `timestamptz` compara con la medianoche del día pedido y se deja fuera el
 * día entero; con un final exclusivo y `lt`, las dos clases de columna se
 * comportan igual.
 *
 * Una ventana desmedida se RECORTA en vez de rechazarse: el modelo pidiendo
 * diez años no es un error del usuario, y contestarle «no» cuando se le puede
 * dar el último año útil solo gasta otra ronda.
 */
export function ventanaConsulta(desde: string, hasta: string, hoy: string): Ventana {
  if (!esFecha(desde) || !esFecha(hasta)) {
    return { ok: false, reason: "Las fechas deben ir en formato AAAA-MM-DD." };
  }
  if (desde > hasta) {
    // Devolver vacío en silencio haría que el modelo concluyera «no hay nada»,
    // que es una respuesta falsa. Mejor decirle que preguntó mal.
    return { ok: false, reason: "La fecha inicial es posterior a la final." };
  }

  // Nada del futuro: no hay datos ahí y pedirlos solo ensancha la ventana.
  const fin = hasta > hoy ? hoy : hasta;
  const hastaExclusivo = addDaysISO(fin, 1);
  const minimo = addDaysISO(hastaExclusivo, -MAX_DIAS_CONSULTA);
  return { ok: true, desde: desde < minimo ? minimo : desde, hastaExclusivo };
}

/**
 * Cuántas filas se devuelven. Un valor ausente o absurdo cae en el tope, que
 * no es rendimiento: lo que vuelve viaja DENTRO del prompt de la llamada
 * siguiente y se come la ventana y la cuota.
 */
export function limiteConsulta(pedido: number | undefined): number {
  if (typeof pedido !== "number" || !Number.isFinite(pedido) || pedido <= 0) return MAX_FILAS_CONSULTA;
  return Math.min(Math.floor(pedido), MAX_FILAS_CONSULTA);
}

/**
 * El id con el que una fila entra al contexto.
 *
 * Lleva la tabla dentro porque el modelo la va a CITAR, y una cita que no se
 * puede seguir hasta la fila que la sostiene no es una cita. Es la misma idea
 * que los `refs` de un `Fact`.
 */
export function idDeFila(tabla: string, id: string): string {
  return `fila:${tabla}:${id}`;
}

/**
 * La parte pura de lo que `consultar` (`src/lib/ai/tools.ts`) hace con cada
 * fila que trae de Supabase: calcularle el id citable y guardar su VALOR en
 * `mapa`, no solo el id (D-194). Separada porque `consultar` es `server-only`
 * y no se puede probar con el runner de node; esto sí.
 *
 * Devuelve las filas en el mismo formato que se le enseña al modelo, para que
 * `consultar` no repita el cálculo del id.
 */
export function registrarFilas(
  mapa: Map<string, Record<string, unknown>>,
  tabla: string,
  filas: Record<string, unknown>[]
): ({ id: string } & Record<string, unknown>)[] {
  return filas.map((registro) => {
    const id = typeof registro.id === "string" ? idDeFila(tabla, registro.id) : idDeFila(tabla, "unica");
    mapa.set(id, registro);
    return { id, ...registro };
  });
}

/**
 * Las tablas en las que busca la herramienta `buscar` (RPC `buscar_en_todo`,
 * migración 0076). Son los CATÁLOGOS: cosas con nombre que existen, no cosas
 * que ocurrieron. Tiene que coincidir con el `union all` de la RPC; una tabla
 * que esté aquí y no allí simplemente no devuelve nada, y una que esté allí y
 * no aquí nunca se pide.
 */
export const TABLAS_DE_BUSQUEDA = [
  "projects",
  "tasks",
  "habits",
  "routines",
  "books",
  "notes",
  "notebooks",
  "personal_goals",
  "key_results",
  "debts",
  "accounts",
  "savings_goals",
  "financial_goals",
  "investments",
  "assets",
  "liabilities",
  "occupations",
  "family_members",
  "cashback_cards",
  "identity_traits"
] as const satisfies readonly TablaConsultableNombre[];

export type TablaDeBusqueda = (typeof TABLAS_DE_BUSQUEDA)[number];

/**
 * Las tablas que se le piden a `buscar_en_todo`: solo las de un dominio que el
 * usuario autorizó. La RLS ya decide QUÉ filas son suyas; esto decide qué
 * dominios quiere que salgan hacia el modelo, que es otra pregunta.
 */
export function tablasDeBusqueda(autorizados: readonly Domain[]): TablaDeBusqueda[] {
  return TABLAS_DE_BUSQUEDA.filter((t) => {
    const d = dominioDeTabla(t);
    return d !== null && autorizados.includes(d);
  });
}

/**
 * Tablas de catálogo: lo que tienen es una fecha de ALTA, no de suceso. Un
 * hábito creado hace ocho meses sigue siendo un hábito hoy, y exigir una
 * ventana sobre `created_at` lo escondía si el modelo no adivinaba cuándo se
 * creó. Las de eventos (registros, gastos, comidas, planes del día…) siguen
 * pidiendo ventana: ahí la fecha ES el dato, y sin ella se traería una vida.
 */
const TABLAS_SIN_VENTANA: ReadonlySet<string> = new Set([
  "habits",
  "routines",
  "projects",
  "books",
  "personal_goals",
  "key_results",
  "debts",
  "accounts",
  "savings_goals",
  "financial_goals",
  "investments",
  "assets",
  "liabilities",
  "notebooks",
  "identity_traits",
  "occupations",
  "family_members",
  "cashback_cards",
  "categories",
  "folders",
  "task_groups"
]);

/** ¿Se puede consultar esta tabla sin `desde`/`hasta`? Solo los catálogos de la lista blanca. */
export function admiteSinVentana(tabla: string): boolean {
  return TABLAS_SIN_VENTANA.has(tabla) && dominioDeTabla(tabla) !== null;
}

/**
 * Tope del texto que `buscar` manda a `buscar_en_todo`. Un nombre no pasa de
 * unas pocas palabras; lo que venga más largo es el modelo pegando una frase
 * entera, y cada carácter cuesta trigramas contra cada fila candidata.
 */
export const MAX_TEXTO_BUSQUEDA = 120;

/** El texto de `buscar`, saneado: sin espacios de sobra y acotado. */
export function textoDeBusqueda(texto: unknown): string {
  return String(texto ?? "").trim().slice(0, MAX_TEXTO_BUSQUEDA);
}

/**
 * Las filas que `buscar` trajo tabla por tabla, en el orden de relevancia que
 * dio la RPC ENTRE tablas —si el libro es lo más parecido, va primero aunque
 * las deudas se trajeran antes—. Lo que la RPC nombró pero no se pudo traer
 * (error, o la RLS cambió entre las dos llamadas) se omite.
 */
export function enOrdenDeBusqueda(
  hallados: readonly { tabla: string; id: string }[],
  traidas: ReadonlyMap<string, readonly Record<string, unknown>[]>
): { tabla: string; registro: Record<string, unknown> }[] {
  const porClave = new Map<string, Record<string, unknown>>();
  for (const [tabla, registros] of traidas) {
    for (const r of registros) porClave.set(`${tabla}:${String(r.id)}`, r);
  }
  const salida: { tabla: string; registro: Record<string, unknown> }[] = [];
  for (const h of hallados) {
    const registro = porClave.get(`${h.tabla}:${h.id}`);
    if (registro) salida.push({ tabla: h.tabla, registro });
  }
  return salida;
}
