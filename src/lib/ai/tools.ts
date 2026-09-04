import "server-only";
import type { FunctionDeclaration, GeminiSchema } from "./gemini-provider";
import { loadFacts, type Db, type ProfileBits } from "@/lib/insights/facts-loader";
import { pseudonymize, tablaConsultable, TABLAS_CONSULTABLES, type AliasMap } from "@/lib/insights/context";
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
 * Y LAS TRES BARRERAS DE PRIVACIDAD SIGUEN PUESTAS, no se rodean:
 *  1. `profiles.ai_domains` manda: `autorizados` llega ya intersecado y una
 *     herramienta no puede leer un dominio que el usuario no encendió.
 *  2. La lista blanca de tablas vive en `insights/context.ts`, con el resto del
 *     filtro de privacidad — un solo archivo que auditar (D-027).
 *  3. Se consulta con el cliente de SESIÓN (llave anon, RLS activa). Nunca con
 *     `createAdminClient()`, que aquí no se importa a propósito.
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

const ESQUEMA_CONSULTA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    tabla: { type: "STRING", description: "Tabla a consultar.", enum: Object.keys(TABLAS_CONSULTABLES), format: "enum" },
    desde: { type: "STRING", description: "Primer día de la ventana, AAAA-MM-DD." },
    hasta: { type: "STRING", description: "Último día de la ventana, AAAA-MM-DD, incluido." },
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
  aliases: AliasMap;
}

export function crearCajaDeHerramientas(opciones: OpcionesCaja): CajaDeHerramientas {
  const entregados = new Set<string>();
  const oculta = (texto: string) => pseudonymize(texto, opciones.aliases);

  const declaraciones: FunctionDeclaration[] = [
    {
      name: "leer_hechos",
      description:
        "Hechos ya calculados sobre el usuario en los dominios que pidas (dinero, deudas, hábitos, tiempo, ejecución). Úsala cuando la pregunta necesite datos que no están en los hechos que ya tienes.",
      parameters: ESQUEMA_HECHOS
    },
    {
      name: "consultar",
      description:
        "Filas concretas de una tabla del usuario en una ventana de fechas. Úsala solo cuando necesites el detalle —qué día pasó algo, qué entradas hubo— y los hechos no lo digan.",
      parameters: ESQUEMA_CONSULTA
    }
  ];

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

    const facts = await loadFacts(opciones.supabase, opciones.userId, dominios, opciones.today, opciones.profile);
    for (const f of facts) entregados.add(f.id);
    return { hechos: facts.map((f) => ({ id: f.id, dato: oculta(f.label) })) };
  }

  async function consultar(args: Record<string, unknown>) {
    const tabla = String(args.tabla ?? "");
    const meta = tablaConsultable(tabla, opciones.autorizados);
    // Un solo mensaje para «no existe» y para «no lo autorizaste»: distinguirlos
    // ya le contaría al modelo algo sobre el usuario.
    if (!meta) return { error: "Esa tabla no está disponible." };

    const ventana = ventanaConsulta(String(args.desde ?? ""), String(args.hasta ?? ""), opciones.today);
    if (!ventana.ok) return { error: ventana.reason };

    const { data, error } = await opciones.supabase
      .from(meta.nombre)
      .select(meta.select)
      .gte(meta.fecha, ventana.desde)
      .lt(meta.fecha, ventana.hastaExclusivo)
      .order(meta.fecha, { ascending: false })
      .limit(limiteConsulta(typeof args.limite === "number" ? args.limite : undefined));

    if (error) return { error: "No se pudo leer esa tabla." };

    const filas = (data ?? []).map((fila) => {
      const registro = fila as unknown as Record<string, unknown>;
      const id = typeof registro.id === "string" ? idDeFila(tabla, registro.id) : idDeFila(tabla, "?");
      entregados.add(id);
      // Se seudonimiza el registro entero serializado: un nombre de cuenta
      // puede venir en cualquier columna, y recorrerlas a mano se queda atrás
      // en cuanto la lista blanca crezca.
      return { id, ...(JSON.parse(oculta(JSON.stringify(registro))) as Record<string, unknown>) };
    });

    return filas.length ? { filas } : { filas: [], nota: "No hay filas en esa ventana." };
  }

  return {
    declaraciones,
    entregados: () => entregados,
    async ejecutar(name, args) {
      // NUNCA LANZA, como todo lo que rodea al modelo (D-021): una herramienta
      // rota tiene que poder contestarse como texto, no tumbar el rail que está
      // montado en todas las pantallas.
      try {
        if (name === "leer_hechos") return await leerHechos(args);
        if (name === "consultar") return await consultar(args);
        return { error: "Esa herramienta no existe." };
      } catch {
        return { error: "La herramienta falló. Contesta con lo que ya tengas." };
      }
    }
  };
}
