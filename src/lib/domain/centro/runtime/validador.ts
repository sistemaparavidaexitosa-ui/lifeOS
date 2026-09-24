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
import { SECTION_KINDS, type SectionKind } from "./secciones.ts";
import { INTENT_KINDS, type Action, type Screen } from "./types.ts";

export const MAX_SECCIONES = 12;

/**
 * Una etiqueta que abre (`<b>`, `<script `, `<Hero />`, `</div>`) o un
 * comentario. «gasto < ingreso» y «<3» no lo son: detrás del `<` no hay una
 * letra pegada seguida de espacio, `>` o `/`.
 */
const MARCADO = /<\/?[a-z][\w-]*[\s>/]|<!--/i;

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
  hero: z.object({ saludo: texto(80), nombre: texto(80), fechaISO: fecha, frase: texto(200).nullable() }).strict(),
  text: z.object({ texto: texto(2000) }).strict(),
  narrative: z.object({ titulo: texto(80), texto: texto(600), href: href.nullable() }).strict(),
  tasks: z
    .object({
      fechaISO: fecha,
      items: z
        .array(z.object({ id: texto(80), titulo: texto(200), contexto: texto(120).nullable(), href: href.nullable() }).strict())
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
  loading: mensaje
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
