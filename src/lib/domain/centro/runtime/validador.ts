// src/lib/domain/centro/runtime/validador.ts
// ¿Se puede pintar esta pantalla? (D-188). Puro, probado en
// tests/domain/centro-runtime-validador.test.ts.
//
// POR QUÉ ZOD AQUÍ Y NO EN EL REGISTRO. En este repo zod vive en la frontera
// (rutas, Server Actions, salida del modelo) y el registro de agentes lo evita
// a propósito (domain/agents/contrato.ts). Esto ES frontera: hoy la cruza lo que
// arma el servidor, mañana lo que escriba un modelo, y la regla no puede
// depender de quién la cruce.
//
// RECHAZA, NO ARREGLA. Una pantalla con un fallo no se repara quitando la
// sección mala: se devuelve el motivo y quien llama cae al lienzo de siempre.
// Arreglar en silencio escondería el fallo del generador que lo produjo.
//
// Tres barreras, en este orden:
//   1. la FORMA (zod): campos, tipos, catálogo cerrado, `escritura: false`;
//   2. los DATOS de cada kind con componente, estrictos: ni un campo de más;
//   3. el CONTENIDO: ningún texto con marcado, ningún `href` fuera de la app.

import { z } from "zod";
import { destinoValido } from "../sugerencias.ts";
import { sanearAccion } from "./acciones.ts";
import { LIMITES, SECTION_KINDS, type SectionKind } from "./secciones.ts";
import { INTENT_KINDS, type Action, type AnySection, type Screen } from "./types.ts";

export const MAX_SECCIONES = 12;

/**
 * Una etiqueta COMPLETA (`<b>`, `</div>`, `<Hero />`, `<img src=x …>`) o un
 * comentario. Hace falta el `>` que la cierra: «gasto < ingreso», «<3» y
 * «costo<limite y cerrar» son texto. React escapa todo lo que pinta, así que
 * esto es defensa de más, no la barrera contra XSS; y un falso positivo cuesta
 * la pantalla entera, por eso se pide la forma entera de una etiqueta.
 */
const MARCADO = /<\/?[a-z][\w-]*(?:\s[^<>]*)?\/?>|<!--/i;

const texto = (max: number) => z.string().max(max);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const href = z.string().max(300);
const mensaje = z.object({ mensaje: texto(200) }).strict();

/**
 * Los datos de los kinds que tienen componente, estrictos. Los demás solo se
 * exigen objeto: su forma la fija el tipo en TypeScript, y su componente, cuando
 * exista, traerá aquí su esquema.
 */
const ESQUEMAS: Partial<Record<SectionKind, z.ZodTypeAny>> = {
  hero: z.object({ saludo: texto(80), nombre: texto(80), fechaISO: fecha, frase: texto(LIMITES.heroFrase).nullable() }).strict(),
  text: z.object({ texto: texto(2000) }).strict(),
  narrative: z.object({ titulo: texto(80), texto: texto(600), href: href.nullable() }).strict(),
  tasks: z
    .object({
      fechaISO: fecha,
      items: z
        .array(z.object({ id: texto(80), titulo: texto(LIMITES.tareaTitulo), contexto: texto(LIMITES.tareaContexto).nullable(), href: href.nullable() }).strict())
        .max(7)
    })
    .strict(),
  quickActions: z
    .object({
      items: z
        .array(
          z
            .object({
              etiqueta: texto(40),
              detalle: texto(60),
              href,
              icono: z.enum(["proyectos", "biblioteca", "finanzas", "rutinas"])
            })
            .strict()
        )
        .max(6)
    })
    .strict(),
  emptyState: mensaje,
  error: mensaje,
  loading: mensaje,
  // --- Fase 2 (D-194): la forma resuelta de los bloques del agente ---------
  lista: z
    .object({
      titulo: texto(80),
      items: z
        .array(
          z
            .object({
              id: texto(120),
              titulo: texto(LIMITES.itemTitulo),
              detalle: texto(LIMITES.itemDetalle).nullable(),
              estado: texto(LIMITES.itemEstado).nullable(),
              href: href.nullable()
            })
            .strict()
        )
        .min(1)
        .max(8)
    })
    .strict(),
  metricas: z
    .object({
      titulo: texto(80).nullable(),
      items: z.array(z.object({ etiqueta: texto(60), valor: texto(LIMITES.metricaValor) }).strict()).min(1).max(4)
    })
    .strict(),
  table: z
    .object({
      titulo: texto(80),
      columnas: z.array(texto(LIMITES.columna)).min(1).max(4),
      filas: z
        .array(z.object({ id: texto(120), celdas: z.array(texto(LIMITES.celda)).max(4), href: href.nullable() }).strict())
        .min(1)
        .max(10)
    })
    .strict(),
  chart: z
    .object({
      titulo: texto(80),
      tipo: z.enum(["linea", "barras"]),
      unidad: texto(8),
      puntos: z.array(z.object({ x: texto(LIMITES.fechaCorta), y: z.number().finite() }).strict()).min(2).max(400)
    })
    .strict(),
  cards: z
    .object({
      titulo: texto(80),
      items: z
        .array(z.object({ id: texto(120), titulo: texto(LIMITES.itemTitulo), detalle: texto(LIMITES.itemDetalle).nullable(), href: href.nullable() }).strict())
        .min(1)
        .max(4)
    })
    .strict(),
  timeline: z
    .object({
      titulo: texto(80),
      items: z
        .array(z.object({ id: texto(120), fecha: texto(LIMITES.fechaCorta), titulo: texto(LIMITES.itemTitulo), href: href.nullable() }).strict())
        .min(1)
        .max(8)
    })
    .strict(),
  irA: z
    .object({ destinos: z.array(z.object({ etiqueta: texto(40), href }).strict()).min(1).max(3) })
    .strict(),
  recomendaciones: z
    .object({
      items: z
        .array(z.object({ propuestaId: z.string().uuid(), titulo: texto(90), motivo: texto(160) }).strict())
        .min(1)
        .max(3)
    })
    .strict(),
  insight: z.object({ texto: texto(240) }).strict(),
  portfolio: z
    .object({
      total: texto(40),
      nota: texto(160),
      serie: z.array(z.object({ x: texto(40), y: z.number().finite() }).strict()).max(400)
    })
    .strict(),
  movimientos: z
    .object({
      configurado: z.boolean(),
      items: z
        .array(
          z
            .object({
              ticker: texto(12),
              nombre: texto(80),
              precio: texto(24).nullable(),
              variacion: texto(12).nullable(),
              tono: z.enum(["ok", "bad", "info"]).nullable(),
              nota: texto(80).nullable()
            })
            .strict()
        )
        .min(1)
        .max(8)
    })
    .strict(),
  watchlist: z
    .object({
      configurado: z.boolean(),
      items: z
        .array(
          z
            .object({
              ticker: texto(12),
              nombre: texto(80),
              precio: texto(24).nullable(),
              variacion: texto(12).nullable(),
              tono: z.enum(["ok", "bad", "info"]).nullable(),
              serie: z.array(z.number().finite()).max(400)
            })
            .strict()
        )
        .min(1)
        .max(20)
    })
    .strict(),
  // T3: la rutina de hoy. 1..20 hábitos — el mismo tope que `maxRoutineSteps`
  // pide en `pantalla.ts`, y un tope propio de todas formas: esta pantalla no
  // puede confiar en que quien la llenó lo haya respetado.
  rutina: z
    .object({
      routineId: texto(80),
      nombre: texto(120),
      habitos: z
        .array(
          z
            .object({
              habitId: texto(80),
              nombre: texto(120),
              duracionMin: z.number().int().min(0).max(600).nullable()
            })
            .strict()
        )
        .min(1)
        .max(20)
    })
    .strict()
};

const DATOS_SIN_ESQUEMA = z.record(z.unknown());

const seccion = z
  .object({ id: z.string().min(1).max(60), kind: z.enum(SECTION_KINDS), title: texto(80).optional(), data: z.unknown() })
  .strict();

const pantalla = z
  .object({
    id: z.string().min(1).max(80),
    intent: z.enum(INTENT_KINDS),
    title: z.string().min(1).max(120),
    subtitle: texto(200).optional(),
    narrative: texto(600).optional(),
    layout: z.object({ densidad: z.enum(["aireada", "compacta"]) }).strict(),
    sections: z.array(seccion).max(MAX_SECCIONES),
    actions: z.array(z.unknown()).max(6),
    refreshPolicy: z.discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("alAbrir") }).strict(),
      z.object({ tipo: z.literal("cada"), segundos: z.number().int().min(60).max(86_400) }).strict(),
      z.object({ tipo: z.literal("porFranja") }).strict()
    ]),
    permissions: z.object({ lectura: z.literal(true), escritura: z.literal(false) }).strict()
  })
  .strict();

export interface ContextoDeValidacion {
  /** Los proyectos que se pueden enlazar con `?project=`. */
  proyectos: { id: string }[];
}

export type ResultadoDeValidacion = { ok: true; screen: Screen } | { ok: false; reason: string };

/** El primer texto con marcado o `href` ilegal, con su ruta. `null` si no hay. */
function primerProblema(v: unknown, ruta: string, ctx: ContextoDeValidacion): string | null {
  if (typeof v === "string") return MARCADO.test(v) ? `${ruta} contiene marcado.` : null;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const p = primerProblema(v[i], `${ruta}[${i}]`, ctx);
      if (p) return p;
    }
    return null;
  }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "href" && typeof x === "string" && !destinoValido(x, ctx.proyectos)) {
        return `${ruta}.href no es un destino de la aplicación.`;
      }
      const p = primerProblema(x, `${ruta}.${k}`, ctx);
      if (p) return p;
    }
  }
  return null;
}

export function validarScreen(v: unknown, ctx: ContextoDeValidacion): ResultadoDeValidacion {
  const forma = pantalla.safeParse(v);
  if (!forma.success) {
    const i = forma.error.issues[0];
    return { ok: false, reason: `Forma inválida en «${i?.path.join(".") || "pantalla"}»: ${i?.message ?? "desconocido"}.` };
  }

  const ids = new Set<string>();
  for (const s of forma.data.sections) {
    if (ids.has(s.id)) return { ok: false, reason: `Sección repetida: «${s.id}».` };
    ids.add(s.id);
    if (!(ESQUEMAS[s.kind] ?? DATOS_SIN_ESQUEMA).safeParse(s.data).success) {
      return { ok: false, reason: `La sección «${s.id}» no tiene la forma de «${s.kind}».` };
    }
  }

  const problema = primerProblema(forma.data, "pantalla", ctx);
  if (problema) return { ok: false, reason: problema };

  const actions: Action[] = [];
  for (const a of forma.data.actions) {
    const saneada = sanearAccion(a, ctx.proyectos);
    if (!saneada) return { ok: false, reason: "Una acción no tiene un destino válido." };
    actions.push(saneada);
  }

  // El cast es seguro por lo de arriba: cada sección se comprobó contra el
  // esquema de SU kind, que es la pareja que `AnySection` expresa y zod no.
  return { ok: true, screen: { ...forma.data, actions } as Screen };
}

/** Una pantalla de UNA sección, para pasarla sola por `validarScreen`. */
function pantallaDeUnaSeccion(s: AnySection): Screen {
  return {
    id: "validacion",
    intent: "libre",
    title: "Centro",
    layout: { densidad: "aireada" },
    sections: [s],
    actions: [],
    refreshPolicy: { tipo: "alAbrir" },
    permissions: { lectura: true, escritura: false }
  };
}

/**
 * SECCIÓN POR SECCIÓN (spec: «bloque con forma inválida → ese bloque no
 * sale»). Cada sección pasa sola por este validador; la que no pasa se cae
 * con su motivo en el log y las demás siguen. Validar la pantalla entera de
 * una vez tira TODO por un solo enlace malo — lo que le pasaba a «Hoy»
 * (`armarPantallaConProyectos`) antes de T1, y lo que el turno del agente
 * (`componerTurno`) ya evitaba desde D-194.
 */
export function validarPorSeccion(secciones: AnySection[], proyectos: { id: string }[], etiqueta: string): AnySection[] {
  const buenas: AnySection[] = [];
  const ids = new Set<string>();
  for (const s of secciones) {
    if (ids.has(s.id)) {
      console.warn(`[${etiqueta}] sección «${s.id}» (${s.kind}) descartada: id repetido.`);
      continue;
    }
    if (buenas.length >= MAX_SECCIONES) {
      console.warn(`[${etiqueta}] sección «${s.id}» (${s.kind}) descartada: más de ${MAX_SECCIONES} secciones.`);
      continue;
    }
    const r = validarScreen(pantallaDeUnaSeccion(s), { proyectos });
    if (!r.ok) {
      console.warn(`[${etiqueta}] sección «${s.id}» (${s.kind}) descartada: ${r.reason}`);
      continue;
    }
    ids.add(s.id);
    buenas.push(r.screen.sections[0]!);
  }
  return buenas;
}
