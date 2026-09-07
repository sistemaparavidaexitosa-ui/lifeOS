import "server-only";
import { generateGroundedText, type FunctionDeclaration, type GeminiSchema } from "./gemini-provider";
import { loadFacts, type Db, type FactsOverrides, type ProfileBits } from "@/lib/insights/facts-loader";
import { tablaConsultable, TABLAS_CONSULTABLES } from "@/lib/insights/context";
import { idDeFila, limiteConsulta, ventanaConsulta } from "@/lib/domain/ai/tools.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";

/**
 * LAS HERRAMIENTAS DEL MODELO (D-097).
 *
 * Hasta ahora el modelo recibía 40 hechos precocinados y punto: si la respuesta
 * necesitaba un dato que no estaba entre esos 40, no había forma de pedirlo.
 * Con herramientas puede bajar al dato concreto («¿qué comí el martes?») en vez
 * de conformarse con el resumen.
 *
 * LA REGLA QUE NO SE ROMPE: TODO LO QUE DEVUELVE UNA HERRAMIENTA LLEVA ID.
 * El motor entero se apoya en que el modelo no calcula: cita hechos con id
 * estable y `validateAnchoring` descarta lo que cite un id que no se le envió.
 * Una herramienta que devolviera filas anónimas dejaría al modelo redactando
 * cifras que nadie puede rastrear, y esa red de seguridad se caería sin que
 * fallara nada. Por eso hasta una fila cruda entra con `fila:<tabla>:<uuid>`.
 *
 * Y LAS TRES BARRERAS QUE SIGUEN PUESTAS, no se rodean:
 *  1. `profiles.ai_domains` manda: `autorizados` llega ya intersecado y una
 *     herramienta no puede leer un dominio que el usuario no encendió.
 *  2. La lista blanca de tablas vive en `insights/context.ts`, con el resto del
 *     filtro — un solo archivo que auditar (D-027).
 *  3. Se consulta con el cliente de SESIÓN (llave anon, RLS activa). Nunca con
 *     `createAdminClient()`, que aquí no se importa a propósito.
 *
 * La CUARTA barrera —seudonimizar los nombres— se retiró en 0053. Ver la
 * cabecera de `insights/context.ts`: fue una decisión del dueño del sistema,
 * no un descuido, y es lo que permite que el coach diga «Cuenta Nómina».
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
   * Lo que se buscó en internet, textual. Va a `audit_log`: sin esto, «salió
   * una consulta hacia Google» y «salió QUÉ hacia Google» se ven igual, y solo
   * la segunda permite comprobar que no viajaron datos del usuario.
   */
  busquedas: () => string[];
}

const ESQUEMA_HECHOS: GeminiSchema = {
  type: "OBJECT",
  properties: {
    dominios: {
      type: "ARRAY",
      description: "Dominios de los que quieres los hechos. Vacío = todos los que el usuario autorizó.",
      items: { type: "STRING" }
    }
  },
  required: ["dominios"],
  propertyOrdering: ["dominios"]
};

/**
 * La búsqueda no lleva ventana ni tabla: lleva una frase. Y lleva un aviso
 * dentro de la propia descripción del parámetro, que es donde el modelo lo lee
 * en cada llamada — más fiable que una línea perdida en el prompt de sistema.
 */
const ESQUEMA_BUSQUEDA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    consulta: {
      type: "STRING",
      description:
        "Qué buscar, en lenguaje natural. NO incluyas datos del usuario: ni cifras suyas, ni nombres de sus cuentas, personas, proyectos o metas. Busca el concepto general, no su caso."
    }
  },
  required: ["consulta"],
  propertyOrdering: ["consulta"]
};

const ESQUEMA_CONSULTA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    tabla: { type: "STRING", description: "Tabla a consultar.", enum: Object.keys(TABLAS_CONSULTABLES), format: "enum" },
    desde: { type: "STRING", description: "Primer día de la ventana, AAAA-MM-DD. Algunas tablas no tienen fecha y lo ignoran." },
    hasta: { type: "STRING", description: "Último día de la ventana, AAAA-MM-DD, incluido. Algunas tablas no tienen fecha y lo ignoran." },
    limite: { type: "INTEGER", description: "Cuántas filas como mucho." }
  },
  required: ["tabla", "desde", "hasta", "limite"],
  propertyOrdering: ["tabla", "desde", "hasta", "limite"]
};

export interface OpcionesCaja {
  supabase: Db;
  userId: string;
  /** Dominios ya intersecados con el opt-in del usuario. */
  autorizados: Domain[];
  today: string;
  profile: ProfileBits;
  /**
   * Quita `consultar` de la caja.
   *
   * Lo usa el mensaje diario del coach, y no es una limitación de producto sino
   * la consecuencia directa de dónde corre: sin sesión, con el cliente de
   * servicio y por tanto SIN RLS. `consultar` compone la consulta a partir de
   * lo que el modelo pida, y ahí no habría forma de garantizar que lleve el
   * filtro por usuario. `leer_hechos` sí se queda: sus consultas son las de
   * `loadFacts`, escritas a mano y con sus filtros explícitos.
   */
  sinConsultarFilas?: boolean;
  /** Lo que `loadFacts` no puede resolver sin sesión. Ver `coach/facts.ts`. */
  overrides?: FactsOverrides;
}

export function crearCajaDeHerramientas(opciones: OpcionesCaja): CajaDeHerramientas {
  const entregados = new Set<string>();
  const busquedas: string[] = [];

  const declaraciones: FunctionDeclaration[] = [
    {
      name: "leer_hechos",
      description:
        "Hechos ya calculados sobre el usuario en los dominios que pidas: money, debt, habits, time, execution, nutrition, growth (metas y lectura), activity (su equipo). Úsala cuando la pregunta necesite datos que no están en los hechos que ya tienes.",
      parameters: ESQUEMA_HECHOS
    },
    {
      name: "consultar",
      description:
        "Filas concretas de una tabla del usuario en una ventana de fechas. Es la que baja al dato: metas, planes diarios, agenda, gastos, comidas, notas, libros, patrimonio, actividad del equipo. Úsala en cuanto la pregunta pida detalle que los hechos no digan.",
      parameters: ESQUEMA_CONSULTA
    },
    {
      name: "buscar_en_internet",
      description:
        "Busca en Google y devuelve un resumen con sus fuentes. Úsala cuando la respuesta dependa de algo que NO está en la vida del usuario: un método, un dato del mundo, un precio de referencia, una noticia. No la uses para lo que ya puedes consultar en sus tablas.",
      parameters: ESQUEMA_BUSQUEDA
    }
  ].filter((d) => !(opciones.sinConsultarFilas && d.name === "consultar"));

  async function leerHechos(args: Record<string, unknown>) {
    const pedidos = Array.isArray(args.dominios) ? (args.dominios as string[]) : [];
    // Intersección con lo autorizado, SIEMPRE. Una lista vacía significa
    // «todo lo que se pueda», no «todo».
    const dominios = pedidos.length
      ? opciones.autorizados.filter((d) => pedidos.includes(d))
      : [...opciones.autorizados];

    if (!dominios.length) {
      return { error: "No hay ningún dominio autorizado para eso. El usuario lo enciende en Configuración → IA." };
    }

    const facts = await loadFacts(
      opciones.supabase,
      opciones.userId,
      dominios,
      opciones.today,
      opciones.profile,
      opciones.overrides ?? {}
    );
    for (const f of facts) entregados.add(f.id);
    return { hechos: facts.map((f) => ({ id: f.id, dato: f.label })) };
  }

  async function consultar(args: Record<string, unknown>) {
    // Segunda barrera, además de no declararla: si el modelo la nombra igual
    // —porque la vio en una conversación anterior—, aquí no pasa.
    if (opciones.sinConsultarFilas) return { error: "Esa herramienta no está disponible ahora." };
    const tabla = String(args.tabla ?? "");
    const meta = tablaConsultable(tabla, opciones.autorizados);
    // Un solo mensaje para «no existe» y para «no lo autorizaste»: distinguirlos
    // ya le contaría al modelo algo sobre el usuario.
    if (!meta) return { error: "Esa tabla no está disponible." };

    const tope = limiteConsulta(typeof args.limite === "number" ? args.limite : undefined);

    // Una tabla sin columna de fecha (`categories`, `task_groups`,
    // `nutrition_profiles`, `folders`) se trae entera hasta el tope. No es un
    // agujero: son catálogos que caben de sobra ahí, y acotarlos por una fecha
    // que no tienen solo serviría para esconder filas al azar.
    let consulta = opciones.supabase.from(meta.nombre).select(meta.select).limit(tope);

    if (meta.fecha) {
      const ventana = ventanaConsulta(String(args.desde ?? ""), String(args.hasta ?? ""), opciones.today);
      if (!ventana.ok) return { error: ventana.reason };
      consulta = consulta
        .gte(meta.fecha, ventana.desde)
        .lt(meta.fecha, ventana.hastaExclusivo)
        .order(meta.fecha, { ascending: false });
    }

    const { data, error } = await consulta;

    if (error) return { error: "No se pudo leer esa tabla." };

    const filas = (data ?? []).map((fila) => {
      const registro = fila as unknown as Record<string, unknown>;
      // `nutrition_profiles` no tiene `id` —su PK es `user_id`, que no se
      // trae—, así que la fila se cita por el nombre de su tabla. Sin un id
      // citable, el modelo no podría respaldar nada de lo que dijera con ella.
      const id = typeof registro.id === "string" ? idDeFila(tabla, registro.id) : idDeFila(tabla, "unica");
      entregados.add(id);
      return { id, ...registro };
    });

    return filas.length ? { filas } : { filas: [], nota: "No hay filas en esa ventana." };
  }

  /**
   * LA ÚNICA COSA QUE SALE HACIA UN TERCERO DISTINTO DEL MODELO.
   *
   * Por eso se cuenta (`busquedas`) y se registra la consulta: el rastro de
   * `audit_log` tiene que poder decir QUÉ se buscó, no solo que se buscó. La
   * regla de no meter datos del usuario en la consulta vive en la descripción
   * del parámetro y en el prompt; esto es lo que permite comprobar después si
   * se respetó.
   */
  async function buscar(args: Record<string, unknown>) {
    const consulta = String(args.consulta ?? "").trim();
    if (!consulta) return { error: "Dime qué buscar." };

    busquedas.push(consulta);
    const r = await generateGroundedText({ consulta });
    if (!r.ok) return { error: r.reason ?? "No se pudo buscar." };

    for (const f of r.fuentes) entregados.add(f.id);
    return {
      resumen: r.texto,
      fuentes: r.fuentes,
      nota: "Cita las fuentes por su id (web:1, web:2…) en factIds, igual que un hecho."
    };
  }

  return {
    declaraciones,
    entregados: () => entregados,
    busquedas: () => [...busquedas],
    async ejecutar(name, args) {
      // NUNCA LANZA, como todo lo que rodea al modelo (D-021): una herramienta
      // rota tiene que poder contestarse como texto, no tumbar el rail que está
      // montado en todas las pantallas.
      try {
        if (name === "leer_hechos") return await leerHechos(args);
        if (name === "consultar") return await consultar(args);
        if (name === "buscar_en_internet") return await buscar(args);
        return { error: "Esa herramienta no existe." };
      } catch {
        return { error: "La herramienta falló. Contesta con lo que ya tengas." };
      }
    }
  };
}
