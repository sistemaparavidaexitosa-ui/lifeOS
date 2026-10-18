// src/lib/centro/interprete/interpretar.ts
// Un turno del Centro SIN modelo, cuando se puede (D-205). SERVIDOR.
//
// Lo que hace aquí el servidor es solo LEER con la sesión (RLS): el catálogo
// de proyectos/cuadernos, las filas que se nombraron y los alimentos. Decidir
// es de las funciones puras (`analizar`, `resolverAnalisis`) y escribir, de
// Guardar (`confirmarCambio`).
//
// NUNCA LANZA: `null` = «esto no lo entendí, que siga la IA». Un intérprete
// roto no puede dejar el Centro sin respuesta, solo más caro.
import "server-only";
import { after } from "next/server";
import type { Cerebro } from "@/lib/ai-chat/cerebro";
import type { AnySection } from "@/lib/domain/centro/runtime/types.ts";
import { analizar, MARCA_DE_FILA, type Analisis } from "@/lib/domain/centro/interprete/analizar.ts";
import { resolverAnalisis, type Candidato, type ContextoDeResolucion, type Interpretacion, type Opcion } from "@/lib/domain/centro/interprete/resolver.ts";
import { normalizar } from "@/lib/domain/centro/interprete/normalizar.ts";
import { ESCRITURA_POR_TABLA, type EntradaDeEscritura } from "@/lib/domain/centro/escritura/registro.ts";
import { MAX_CAMBIOS_POR_TURNO } from "@/lib/domain/centro/agente/contrato.ts";
import { TABLAS_DE_BUSQUEDA, registrarFilas } from "@/lib/domain/ai/tools.ts";
import { tablaConsultable } from "@/lib/insights/context";
import { proponerCambios } from "@/lib/centro/escritura/proponer";
import { validarPorSeccion } from "@/lib/domain/centro/runtime/validador.ts";
import { analizarConsulta, filtrosDeConsulta, seccionesDeConsulta, CONSULTAS, MAX_FILAS, type DefConsulta } from "@/lib/domain/centro/interprete/consultas.ts";
import { publicEnv } from "@/config/env";

const MAX_CATALOGO = 20;
const MAX_CANDIDATOS = 5;
const MAX_ALIMENTOS = 3;
const TEXTO_CAMBIOS = "¿Lo entendí bien? Revísalo y pulsa Guardar.";

type Escribir = Extract<Analisis, { tipo: "escribir" }>;

export async function interpretarTurno(texto: string, cerebro: Cerebro): Promise<{ texto: string; secciones: AnySection[] } | null> {
  try {
    // Pedir información («dame mis cuadernos») se contesta leyendo, sin modelo.
    const c = analizarConsulta(texto);
    if (c) {
      const r = await consultar(CONSULTAS[c.consulta]!, c.filtro, cerebro);
      if (r) {
        after(async () => {
          await cerebro.supabase.from("audit_log").insert({ user_id: cerebro.user.id, action: "ai.centro_interprete", object: "centro", meta: { salida: "consulta", consulta: c.consulta, filtro: c.filtro } });
        });
        return r;
      }
    }

    const a = analizar(texto, cerebro.today);
    if (a.tipo === "ia") return null;

    const ctx: ContextoDeResolucion = { autorizados: cerebro.dominios, catalogo: {}, candidatos: [], alimentos: [], hoy: cerebro.today };
    if (a.tipo === "escribir") await leer(a, cerebro, ctx);

    const r = resolverAnalisis(a, ctx);
    // Se entendió la orden pero algo no cuadró: es la retro que dice qué
    // vocabulario o qué caso le falta al intérprete.
    if (r.tipo === "ia") console.info(`[centro-interprete] a la IA (${a.tipo === "escribir" ? `${a.operacion} ${a.tabla}` : a.tipo}): ${r.motivo}`);
    // La marca `#<uuid>` es para el intérprete; a la IA le llega la petición limpia.
    const salida = await pintar(r, cerebro, texto.replace(MARCA_DE_FILA, ""));
    if (!salida) return null;
    // La misma última puerta que las secciones del modelo (`componerTurno`):
    // lo que no pasa el validador del runtime no se pinta, y sin nada que
    // pintar sigue la IA.
    const secciones = validarPorSeccion(salida.secciones, [], "centro-interprete");
    if (!secciones.length) return null;
    auditar(cerebro, r, a);
    return { texto: salida.texto, secciones };
  } catch (e) {
    console.warn("[centro-interprete] falló, sigue la IA:", e);
    return null;
  }
}

interface ConsultaDinamica {
  eq(c: string, v: unknown): ConsultaDinamica;
  neq(c: string, v: unknown): ConsultaDinamica;
  lt(c: string, v: unknown): ConsultaDinamica;
  lte(c: string, v: unknown): ConsultaDinamica;
  gte(c: string, v: unknown): ConsultaDinamica;
  in(c: string, v: unknown[]): ConsultaDinamica;
  not(c: string, op: string, v: string): ConsultaDinamica;
  order(c: string, o: { ascending: boolean; nullsFirst: boolean }): ConsultaDinamica;
  limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown; count: number | null }>;
}

/**
 * Una consulta directa: la MISMA lectura con la sesión que la herramienta
 * `consultar` del modelo (`tablaConsultable` + RLS), y los componentes del
 * Centro para enseñarla. `null` (sigue la IA) si el dominio no está autorizado.
 */
async function consultar(def: DefConsulta, filtro: string | null, cerebro: Cerebro): Promise<{ texto: string; secciones: AnySection[] } | null> {
  const meta = tablaConsultable(def.tabla, cerebro.dominios);
  if (!meta) return null;
  // Las ocupaciones se filtran ya leídas (recurrentes por día de la semana):
  // se leen todas, que son pocas. El resto, como mucho una página y su cuenta.
  // La tabla y las columnas son dinámicas (las fija `CONSULTAS`, una lista
  // cerrada): `tsc` no puede tipar el constructor, así que se describe a mano.
  let q = cerebro.supabase.from(meta.nombre).select(def.select, { count: "exact" }) as unknown as ConsultaDinamica;
  for (const f of filtrosDeConsulta(def, filtro, cerebro.today)) {
    if (f.op === "in") q = q.in(f.campo, f.valor as (string | number)[]);
    else if (f.op === "notIn") q = q.not(f.campo, "in", `(${(f.valor as (string | number)[]).join(",")})`);
    else q = q[f.op](f.campo, f.valor as string);
  }
  const limite = def.enJs ? 200 : MAX_FILAS[def.forma];
  const { data, error, count } = await q.order(def.orden.campo, { ascending: def.orden.asc, nullsFirst: false }).limit(limite);
  if (error) {
    console.warn("[centro-interprete] la consulta falló, sigue la IA:", error);
    return null;
  }
  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  const secciones = seccionesDeConsulta(def, filas, {
    hoy: cerebro.today,
    total: count ?? filas.length,
    filtro,
    moneda: publicEnv.NEXT_PUBLIC_DEFAULT_CURRENCY,
    locale: publicEnv.NEXT_PUBLIC_DEFAULT_LOCALE
  });
  const proyectos = def.tabla === "projects" ? filas.map((r) => ({ id: String(r.id) })) : [];
  const buenas = validarPorSeccion(secciones, proyectos, "centro-consulta");
  return buenas.length ? { texto: "", secciones: buenas } : null;
}

/** Lo que el resolver necesita saber de la base, y nada más. */
async function leer(a: Escribir, cerebro: Cerebro, ctx: ContextoDeResolucion) {
  const entrada = ESCRITURA_POR_TABLA[a.tabla] as EntradaDeEscritura;

  if (a.operacion === "crear") {
    for (const [nombre, c] of Object.entries(entrada.campos)) {
      if (c.tipo !== "ref" || !c.refTabla) continue;
      // Los destinos de una ref (`projects`, `notebooks`, `habits`, `tasks`)
      // tienen todos `id`, `created_at` y su columna de nombre (`refTitulo`).
      // El cast es solo para `tsc`, que no deja un `.from` dinámico — y por eso
      // tampoco comprueba las columnas: si se añade una ref nueva, mirar que
      // las tenga (lo cubre el test del registro).
      const col = c.refTitulo ?? "title";
      const consulta = () => cerebro.supabase.from(c.refTabla as "projects").select(`id, ${col}` as "id, title");
      // Si se dijo el nombre, además se busca ESE: con más de 20 hábitos o
      // tareas, el nombrado puede no estar entre los recientes. Por la RPC de
      // `buscar` (ignora acentos: «rediseno» encuentra «Rediseño»).
      const dicho = a.menciones[nombre] ?? (entrada.dictado === nombre ? a.resto : undefined);
      let nombrados: Record<string, unknown>[] = [];
      if (dicho && (TABLAS_DE_BUSQUEDA as readonly string[]).includes(c.refTabla)) {
        const { data: hallados, error } = await cerebro.supabase.rpc("buscar_en_todo", { p_texto: dicho, p_tablas: [c.refTabla], p_limite: MAX_CATALOGO });
        if (error) throw error;
        const ids = (hallados ?? []).map((h) => h.id);
        if (ids.length) {
          const { data, error: e2 } = await consulta().in("id", ids);
          if (e2) throw e2;
          nombrados = (data ?? []) as unknown as Record<string, unknown>[];
        }
      }
      const { data: recientes, error } = await consulta().order("created_at", { ascending: false }).limit(MAX_CATALOGO);
      if (error) throw error;
      const vistos = new Map<string, Opcion>();
      for (const f of [...nombrados, ...((recientes ?? []) as unknown as Record<string, unknown>[])]) {
        vistos.set(String(f.id), { id: String(f.id), nombre: String(f[col] ?? "") });
      }
      ctx.catalogo[c.refTabla] = [...vistos.values()];
    }
    if (a.tabla === "food_entries" && a.resto) {
      const { data, error } = await cerebro.supabase
        .from("foods")
        .select("name, kcal_100g, protein_100g, carbs_100g, fat_100g")
        .ilike("name", `%${escaparLike(a.resto)}%`)
        .limit(MAX_ALIMENTOS);
      if (error) throw error;
      ctx.alimentos = (data ?? []).map((f) => ({
        nombre: f.name,
        kcal100: Number(f.kcal_100g),
        protein100: Number(f.protein_100g),
        carbs100: Number(f.carbs_100g),
        fat100: Number(f.fat_100g)
      }));
    }
    return;
  }

  if (a.resto) ctx.candidatos = await candidatos(a, entrada, cerebro);
}

/** `%` y `_` del texto de la persona son letras, no comodines. */
function escaparLike(t: string): string {
  return t.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Las filas que se llaman como lo que se dijo, con la MISMA lectura que la
 * herramienta `buscar` del modelo (RPC `buscar_en_todo` + `tablaConsultable`):
 * lo que llega a `filas` es exactamente lo que el modelo habría podido leer.
 */
async function candidatos(a: Escribir, entrada: EntradaDeEscritura, cerebro: Cerebro): Promise<Candidato[]> {
  const meta = tablaConsultable(a.tabla, cerebro.dominios);
  if (!meta) return [];

  let filas: Record<string, unknown>[];
  if ((TABLAS_DE_BUSQUEDA as readonly string[]).includes(a.tabla)) {
    const { data: hallados, error } = await cerebro.supabase.rpc("buscar_en_todo", { p_texto: a.resto, p_tablas: [a.tabla], p_limite: MAX_CANDIDATOS });
    if (error) throw error;
    const ids = (hallados ?? []).map((h) => h.id);
    if (!ids.length) return [];
    const { data, error: e2 } = await cerebro.supabase.from(meta.nombre).select(meta.select).in("id", ids);
    if (e2) throw e2;
    const porId = new Map(((data ?? []) as unknown as Record<string, unknown>[]).map((f) => [f.id, f]));
    // En el orden de relevancia de la RPC.
    filas = ids.map((id) => porId.get(id)).filter((f): f is Record<string, unknown> => Boolean(f));
  } else {
    // Tablas de sucesos (comidas): por nombre, lo más reciente primero.
    let q = cerebro.supabase.from(meta.nombre).select(meta.select).ilike(entrada.titulo, `%${escaparLike(a.resto)}%`);
    if (meta.fecha) q = q.order(meta.fecha, { ascending: false });
    const { data, error } = await q.limit(MAX_CANDIDATOS);
    if (error) throw error;
    filas = (data ?? []) as unknown as Record<string, unknown>[];
  }

  // Las claves del mapa (`fila:<tabla>:<uuid>`), no lo que devuelve
  // `registrarFilas`: ahí el `id` crudo de la fila pisa al de `fila:…`.
  const mapa = new Map<string, Record<string, unknown>>();
  registrarFilas(mapa, a.tabla, filas);
  return [...mapa].map(([fila, registro]) => {
    const nombre = String(registro[entrada.titulo] ?? "");
    return { fila, nombre, exacta: normalizar(nombre) === normalizar(a.resto), registro };
  });
}

async function pintar(r: Interpretacion, cerebro: Cerebro, original: string): Promise<{ texto: string; secciones: AnySection[] } | null> {
  switch (r.tipo) {
    case "ia":
      return null;
    case "navegar":
      return { texto: "", secciones: [{ id: "i0", kind: "irA", data: { destinos: [r.destino] } }] };
    case "pregunta": {
      const [primera, ...resto] = r.opciones;
      if (!primera) return null;
      return {
        texto: "",
        secciones: [
          {
            id: "i0",
            kind: "confirmarEntendimiento",
            data: { entendi: r.entendi, seguir: primera.etiqueta, textoSeguir: primera.texto, alternativas: resto.map((o) => ({ etiqueta: o.etiqueta, texto: o.texto })) }
          }
        ]
      };
    }
    case "nada":
      return {
        texto: "",
        secciones: [{ id: "i0", kind: "confirmarEntendimiento", data: { entendi: r.entendi, seguir: "Pregúntale a la IA", textoSeguir: original, modoSeguir: "ia", alternativas: [] } }]
      };
    case "cambios": {
      const secciones = await proponerCambios({ cambios: r.cambios }, "i0", cerebro, r.filas, { restantes: MAX_CAMBIOS_POR_TURNO }, {
        entendi: r.entendi,
        textoOriginal: original,
        sinIA: true
      });
      // Sin tarjeta (no se pudo guardar la propuesta) no hay nada que enseñar: que siga la IA.
      return secciones.length ? { texto: TEXTO_CAMBIOS, secciones } : null;
    }
  }
}

/**
 * La retro de D-205: cuántas veces resolvió el intérprete, y qué. Con
 * `ai.centro_escritura` (guardado) y `ai.centro_entendimiento` («No es esto»)
 * se mide el acierto sin una tabla nueva.
 */
function auditar(cerebro: Cerebro, r: Interpretacion, a: Analisis) {
  if (r.tipo === "ia") return;
  after(async () => {
    const { error } = await cerebro.supabase.from("audit_log").insert({
      user_id: cerebro.user.id,
      action: "ai.centro_interprete",
      object: "centro",
      meta: { salida: r.tipo, tabla: a.tipo === "escribir" ? a.tabla : null, operacion: a.tipo === "escribir" ? a.operacion : null }
    });
    if (error) console.warn("[centro-interprete] no se pudo auditar:", error);
  });
}
