// src/lib/domain/centro/interprete/consultas.ts
// Pedir información SIN gastar tokens: «dame mis cuadernos», «mis tareas de
// hoy», «qué libros estoy leyendo». Puro, probado en
// tests/domain/centro-interprete-consultas.test.ts.
//
// Antes, «dame la lista de cuadernos» iba al modelo y volvía sin la lista. Una
// lista no necesita criterio: se lee y se enseña. El modelo queda para lo que
// sí lo necesita («resume», «compara», «qué hago»).
//
// LA MISMA REGLA DE ORO QUE `analizar`: ANTE LA DUDA, IA. Solo se reconoce
// una petición ENTERA de lista: verbo de pedir (opcional), «mis/los…»,
// el nombre de la colección y, como mucho, un filtro conocido. Cualquier
// palabra de más («y resume el último», «ideas para») y no es consulta.
//
// Lo que se lee lo lee el servidor con la sesión (RLS) y `tablaConsultable`;
// aquí solo se decide QUÉ leer y CÓMO enseñarlo, con los componentes del
// Centro (lista, progreso, agenda) y el mismo validador que todo lo demás.

import { normalizar } from "./normalizar.ts";
import { occupationAppliesOn } from "../../time.ts";
import { formatear, rutaDeFila } from "../agente/resolver.ts";
import { fcorta } from "../../../format.ts";
import { LIMITES, recortar } from "../runtime/secciones.ts";
import type { AnySection } from "../runtime/types.ts";

/** Un filtro que el servidor aplica a la consulta. `"$hoy"` es el día de la persona. */
export interface FiltroDeConsulta {
  campo: string;
  op: "eq" | "neq" | "lt" | "lte" | "gte" | "in" | "notIn";
  valor: string | number | boolean | (string | number)[];
}

type Fila = Record<string, unknown>;

export interface DefConsulta {
  tabla: string;
  /** «Tus cuadernos». */
  titulo: string;
  /** «No tienes cuadernos todavía.» */
  vacio: string;
  sinonimos: string[];
  select: string;
  orden: { campo: string; asc: boolean };
  /** Lo que se lee siempre (p. ej. tareas abiertas). */
  base?: FiltroDeConsulta[];
  /** Filtros con nombre y cómo se dicen. El primero que se diga reemplaza a `base`. */
  filtros?: Record<string, { frases: string[]; filtros: FiltroDeConsulta[]; titulo: string }>;
  /** Palabras que no cambian nada («qué tareas TENGO», «mi agenda DE HOY»). */
  relleno?: string[];
  forma: "lista" | "progreso" | "agenda";
  nombre: (r: Fila) => string | null;
  detalle?: (r: Fila, f: Formateo) => string | null;
  estado?: (r: Fila) => string | null;
  progreso?: { actual: string; meta: string; formato: "numero" | "dinero"; unidad?: string };
  agenda?: { inicio: string; fin: string };
  /** Filtro que solo puede hacerse ya leído (ocupaciones que aplican hoy). */
  enJs?: (r: Fila, hoy: string) => boolean;
  /** «Ver todos» lleva aquí. */
  seccion: { etiqueta: string; href: string };
}

export interface Formateo {
  hoy: string;
  moneda: string;
  locale: string;
}

const ABIERTAS: FiltroDeConsulta = { campo: "status", op: "notIn", valor: ["Completed", "Cancelled"] };
const fecha = (v: unknown, f: Formateo) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? fcorta(v.slice(0, 10), f.hoy, f.locale) || null : null);
const dinero = (v: unknown, f: Formateo) => formatear(v, "dinero", f.moneda, f.locale, LIMITES.metricaValor);
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

const ESTADO_DE_TAREA: Record<string, string> = {
  Pending: "Pendiente",
  InProgress: "En curso",
  Blocked: "Bloqueada",
  Rescheduled: "Reprogramada",
  Completed: "Hecha",
  Cancelled: "Cancelada"
};
const ESTADO_DE_PROYECTO: Record<string, string> = {
  Draft: "Borrador",
  Active: "Activo",
  OnHold: "En pausa",
  Completed: "Terminado",
  Cancelled: "Cancelado",
  Archived: "Archivado"
};
const TIPO_DE_CUENTA: Record<string, string> = { bank: "Banco", cash: "Efectivo", savings: "Ahorro", credit: "Crédito", investment: "Inversión" };

export const CONSULTAS: Record<string, DefConsulta> = {
  cuadernos: {
    tabla: "notebooks",
    titulo: "Tus cuadernos",
    vacio: "No tienes cuadernos todavía.",
    sinonimos: ["cuadernos", "libretas", "notebooks"],
    select: "id, title, updated_at",
    orden: { campo: "updated_at", asc: false },
    forma: "lista",
    nombre: (r) => texto(r.title),
    detalle: (r, f) => (fecha(r.updated_at, f) ? `Editado ${fecha(r.updated_at, f)}` : null),
    seccion: { etiqueta: "Abrir Notebooks", href: "/notebooks" }
  },
  notas: {
    tabla: "notes",
    titulo: "Tus notas recientes",
    vacio: "No tienes notas todavía.",
    sinonimos: ["notas", "apuntes"],
    select: "id, title, body, updated_at",
    orden: { campo: "updated_at", asc: false },
    forma: "lista",
    nombre: (r) => texto(r.title) ?? texto(String(r.body ?? "").split("\n")[0]),
    detalle: (r, f) => fecha(r.updated_at, f),
    seccion: { etiqueta: "Abrir Notebooks", href: "/notebooks" }
  },
  proyectos: {
    tabla: "projects",
    titulo: "Tus proyectos",
    vacio: "No tienes proyectos en curso.",
    sinonimos: ["proyectos"],
    select: "id, title, status, target_date",
    orden: { campo: "created_at", asc: false },
    base: [{ campo: "status", op: "in", valor: ["Active", "Draft", "OnHold"] }],
    filtros: {
      activos: { frases: ["activos", "en curso"], filtros: [{ campo: "status", op: "eq", valor: "Active" }], titulo: "Tus proyectos activos" },
      terminados: { frases: ["terminados", "completados"], filtros: [{ campo: "status", op: "eq", valor: "Completed" }], titulo: "Proyectos terminados" }
    },
    forma: "lista",
    nombre: (r) => texto(r.title),
    estado: (r) => ESTADO_DE_PROYECTO[String(r.status)] ?? null,
    detalle: (r, f) => (fecha(r.target_date, f) ? `Meta ${fecha(r.target_date, f)}` : null),
    seccion: { etiqueta: "Ver proyectos", href: "/execution" }
  },
  tareas: {
    tabla: "tasks",
    titulo: "Tus tareas abiertas",
    vacio: "No tienes tareas abiertas.",
    sinonimos: ["tareas", "pendientes"],
    select: "id, title, status, due, project_id",
    orden: { campo: "due", asc: true },
    base: [ABIERTAS],
    filtros: {
      hoy: { frases: ["de hoy", "para hoy", "hoy"], filtros: [ABIERTAS, { campo: "due", op: "eq", valor: "$hoy" }], titulo: "Tus tareas de hoy" },
      vencidas: { frases: ["vencidas", "atrasadas"], filtros: [ABIERTAS, { campo: "due", op: "lt", valor: "$hoy" }], titulo: "Tareas vencidas" },
      bloqueadas: { frases: ["bloqueadas"], filtros: [{ campo: "status", op: "eq", valor: "Blocked" }], titulo: "Tareas bloqueadas" },
      hechas: { frases: ["hechas", "completadas", "terminadas"], filtros: [{ campo: "status", op: "eq", valor: "Completed" }], titulo: "Tareas hechas" },
      abiertas: { frases: ["abiertas", "pendientes"], filtros: [ABIERTAS], titulo: "Tus tareas abiertas" }
    },
    forma: "lista",
    nombre: (r) => texto(r.title),
    estado: (r) => ESTADO_DE_TAREA[String(r.status)] ?? null,
    detalle: (r, f) => (fecha(r.due, f) ? `Vence ${fecha(r.due, f)}` : null),
    seccion: { etiqueta: "Ver tareas", href: "/execution" }
  },
  habitos: {
    tabla: "habits",
    titulo: "Tus hábitos",
    vacio: "No tienes hábitos todavía.",
    sinonimos: ["habitos"],
    select: "id, name, duration_min, category",
    orden: { campo: "created_at", asc: true },
    forma: "lista",
    nombre: (r) => texto(r.name),
    detalle: (r) => [r.duration_min ? `${r.duration_min} min` : null, texto(r.category)].filter(Boolean).join(" · ") || null,
    seccion: { etiqueta: "Ver rutinas", href: "/development/routines" }
  },
  rutinas: {
    tabla: "routines",
    titulo: "Tus rutinas",
    vacio: "No tienes rutinas todavía.",
    sinonimos: ["rutinas"],
    select: "id, name, frequency, active",
    orden: { campo: "created_at", asc: true },
    forma: "lista",
    nombre: (r) => texto(r.name),
    estado: (r) => (r.active === false ? "Pausada" : texto(r.frequency)),
    seccion: { etiqueta: "Ver rutinas", href: "/development/routines" }
  },
  libros: {
    tabla: "books",
    titulo: "Tu biblioteca",
    vacio: "No tienes libros en tu biblioteca.",
    sinonimos: ["libros", "lecturas", "biblioteca"],
    select: "id, title, author, status, current_page, total_pages",
    orden: { campo: "updated_at", asc: false },
    filtros: {
      leyendo: { frases: ["estoy leyendo", "que estoy leyendo", "leyendo", "en curso"], filtros: [{ campo: "status", op: "eq", valor: "Leyendo" }], titulo: "Lo que estás leyendo" },
      porLeer: { frases: ["por leer", "pendientes"], filtros: [{ campo: "status", op: "eq", valor: "Por leer" }], titulo: "Por leer" },
      terminados: { frases: ["terminados", "leidos"], filtros: [{ campo: "status", op: "eq", valor: "Terminado" }], titulo: "Libros terminados" }
    },
    forma: "progreso",
    nombre: (r) => texto(r.title),
    detalle: (r) => texto(r.author),
    progreso: { actual: "current_page", meta: "total_pages", formato: "numero", unidad: "págs" },
    seccion: { etiqueta: "Abrir biblioteca", href: "/development/library" }
  },
  metas: {
    tabla: "personal_goals",
    titulo: "Tus metas",
    vacio: "No tienes metas activas.",
    sinonimos: ["metas", "metas personales", "objetivos"],
    select: "id, title, status, area, horizon",
    orden: { campo: "created_at", asc: false },
    base: [{ campo: "status", op: "in", valor: ["Activa", "Pausada"] }],
    forma: "lista",
    nombre: (r) => texto(r.title),
    estado: (r) => texto(r.status),
    detalle: (r, f) => [texto(r.area), fecha(r.horizon, f)].filter(Boolean).join(" · ") || null,
    seccion: { etiqueta: "Ver metas", href: "/development/goals" }
  },
  ahorros: {
    tabla: "savings_goals",
    titulo: "Tus metas de ahorro",
    vacio: "No tienes metas de ahorro.",
    sinonimos: ["ahorros", "metas de ahorro"],
    select: "id, name, current_amount, target, target_date",
    orden: { campo: "created_at", asc: false },
    forma: "progreso",
    nombre: (r) => texto(r.name),
    detalle: (r, f) => (fecha(r.target_date, f) ? `Para ${fecha(r.target_date, f)}` : null),
    progreso: { actual: "current_amount", meta: "target", formato: "dinero" },
    seccion: { etiqueta: "Ver ahorros", href: "/savings" }
  },
  deudas: {
    tabla: "debts",
    titulo: "Tus deudas",
    vacio: "No tienes deudas registradas.",
    sinonimos: ["deudas", "prestamos", "creditos"],
    select: "id, name, balance, min_payment, due_day",
    orden: { campo: "balance", asc: false },
    forma: "lista",
    nombre: (r) => texto(r.name),
    estado: (r) => (r.due_day ? `Día ${r.due_day}` : null),
    detalle: (r, f) => (dinero(r.balance, f) ? `Saldo ${dinero(r.balance, f)}` : null),
    seccion: { etiqueta: "Ver deudas", href: "/debt" }
  },
  cuentas: {
    tabla: "accounts",
    titulo: "Tus cuentas",
    vacio: "No tienes cuentas.",
    sinonimos: ["cuentas", "cuentas bancarias"],
    select: "id, name, type",
    orden: { campo: "created_at", asc: true },
    forma: "lista",
    nombre: (r) => texto(r.name),
    estado: (r) => TIPO_DE_CUENTA[String(r.type)] ?? null,
    seccion: { etiqueta: "Ver dinero", href: "/money" }
  },
  agenda: {
    tabla: "occupations",
    titulo: "Tu agenda de hoy",
    vacio: "No tienes ocupaciones hoy.",
    sinonimos: ["agenda", "ocupaciones", "horario"],
    select: "id, title, start_time, end_time, category, recurring, occ_date, days",
    orden: { campo: "start_time", asc: true },
    relleno: ["de hoy", "para hoy", "hoy"],
    forma: "agenda",
    nombre: (r) => texto(r.title),
    detalle: (r) => texto(r.category),
    agenda: { inicio: "start_time", fin: "end_time" },
    enJs: (r, hoy) =>
      occupationAppliesOn({ recurring: Boolean(r.recurring), occDate: (r.occ_date as string | null) ?? null, days: (r.days as number[] | null) ?? [] }, hoy),
    seccion: { etiqueta: "Ver tiempo", href: "/time" }
  },
  recordatorios: {
    tabla: "reminders",
    titulo: "Tus recordatorios",
    vacio: "No tienes recordatorios pendientes.",
    sinonimos: ["recordatorios"],
    select: "id, text, remind_on, done",
    orden: { campo: "remind_on", asc: true },
    base: [{ campo: "done", op: "eq", valor: false }],
    forma: "lista",
    nombre: (r) => texto(r.text) ?? "Recordatorio",
    detalle: (r, f) => fecha(r.remind_on, f),
    seccion: { etiqueta: "Ver tiempo", href: "/time" }
  },
  rasgos: {
    tabla: "identity_traits",
    titulo: "Tus rasgos de identidad",
    vacio: "No has definido rasgos todavía.",
    sinonimos: ["rasgos", "rasgos de identidad"],
    select: "id, name, area, active",
    orden: { campo: "position", asc: true },
    base: [{ campo: "active", op: "eq", valor: true }],
    forma: "lista",
    nombre: (r) => texto(r.name),
    estado: (r) => texto(r.area),
    seccion: { etiqueta: "Ver desarrollo", href: "/development" }
  },
  presupuestos: {
    tabla: "budgets",
    titulo: "Tu presupuesto",
    vacio: "No tienes conceptos de presupuesto.",
    sinonimos: ["presupuestos", "presupuesto", "conceptos del presupuesto"],
    select: "id, category, monthly_cost",
    orden: { campo: "monthly_cost", asc: false },
    forma: "lista",
    nombre: (r) => texto(r.category),
    detalle: (r, f) => (dinero(r.monthly_cost, f) ? `${dinero(r.monthly_cost, f)} al mes` : null),
    seccion: { etiqueta: "Ver presupuesto", href: "/money/budget" }
  },
  comidas: {
    tabla: "food_entries",
    titulo: "Lo que comiste hoy",
    vacio: "Hoy no has registrado comidas.",
    sinonimos: ["comidas"],
    select: "id, name, meal, kcal, local_date",
    orden: { campo: "created_at", asc: true },
    base: [{ campo: "local_date", op: "eq", valor: "$hoy" }],
    relleno: ["de hoy", "hoy"],
    forma: "lista",
    nombre: (r) => texto(r.name),
    estado: (r) => texto(r.meal),
    detalle: (r) => (typeof r.kcal === "number" || typeof r.kcal === "string" ? `${Math.round(Number(r.kcal))} kcal` : null),
    seccion: { etiqueta: "Ver nutrición", href: "/development/nutrition" }
  },
  aprendizajes: {
    tabla: "logbook",
    titulo: "Tus aprendizajes",
    vacio: "No has anotado aprendizajes.",
    sinonimos: ["aprendizajes", "bitacora"],
    select: "id, text, type, created_at",
    orden: { campo: "created_at", asc: false },
    base: [{ campo: "type", op: "eq", valor: "learning" }],
    forma: "lista",
    nombre: (r) => texto(r.text),
    detalle: (r, f) => fecha(r.created_at, f),
    seccion: { etiqueta: "Ver proyectos", href: "/execution" }
  }
};

const PEDIR = [
  "dame", "damelos", "damelas", "muestrame", "ensename", "lista", "listame", "enlista", "quiero ver", "ver",
  "cuales son", "cuales", "que", "trae", "traeme", "mostrar", "abre la lista de"
];
const DETERMINANTES = ["mis", "mi", "los", "las", "tus", "tu", "todos mis", "todas mis", "todos los", "todas las"];
const LISTA_DE = ["la lista de", "el listado de", "lista de"];
const RELLENO = ["tengo", "hay", "son", "tienes", "registrados", "registradas", "que tengo", "que hay"];

const alternar = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length).map((x) => x.replace(/ /g, "\\s+")).join("|");

/** `{ consulta, filtro }` si el texto es una petición de lista y nada más; `null` si no. */
export function analizarConsulta(textoOriginal: string): { consulta: string; filtro: string | null } | null {
  const n = normalizar(textoOriginal.replace(/[¿?¡!.,:;]/g, " ")).replace(/\s+/g, " ").trim();
  if (!n || n.length > 120) return null;

  const sinonimos = Object.entries(CONSULTAS).flatMap(([k, d]) => d.sinonimos.map((s) => ({ k, s })));
  const re = new RegExp(
    `^(?:(${alternar(PEDIR)})\\s+)?(?:(?:${alternar(LISTA_DE)})\\s+)?(?:(${alternar(DETERMINANTES)})\\s+)?(${alternar(sinonimos.map((x) => x.s))})(?:\\s+(.*))?$`
  );
  const m = re.exec(n);
  // Sin verbo de pedir ni «mis/los…», «tareas» suelto no basta.
  if (!m || (!m[1] && !m[2])) return null;
  const consulta = sinonimos.find((x) => x.s === m[3])!.k;
  const def = CONSULTAS[consulta]!;

  let resto = (m[4] ?? "").trim();
  const quitar = (frases: string[]) => {
    for (const f of [...frases].sort((a, b) => b.length - a.length)) {
      const r = new RegExp(`(?:^|\\s)${f.replace(/ /g, "\\s+")}(?=\\s|$)`);
      if (r.test(resto)) {
        resto = resto.replace(r, " ").replace(/\s+/g, " ").trim();
        return true;
      }
    }
    return false;
  };
  let filtro: string | null = null;
  for (const [nombre, f] of Object.entries(def.filtros ?? {})) {
    if (quitar(f.frases)) {
      filtro = nombre;
      break;
    }
  }
  quitar(def.relleno ?? []);
  while (quitar(RELLENO)) {
    /* «qué tareas tengo», «qué hay» */
  }
  return resto ? null : { consulta, filtro };
}

/** Los filtros a aplicar en el servidor, con `$hoy` ya resuelto. */
export function filtrosDeConsulta(def: DefConsulta, filtro: string | null, hoy: string): FiltroDeConsulta[] {
  const fs = (filtro && def.filtros?.[filtro]?.filtros) || def.base || [];
  return fs.map((f) => ({ ...f, valor: f.valor === "$hoy" ? hoy : f.valor }));
}

/** Cuántas filas enseña cada forma, como mucho (los topes del validador). */
export const MAX_FILAS: Record<DefConsulta["forma"], number> = { lista: 8, progreso: 8, agenda: 12 };

const hora = (v: unknown) => (typeof v === "string" && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null);

/**
 * Las secciones para lo leído. `filas` ya viene filtrado en el servidor;
 * `enJs` se aplica aquí. `total` es cuántas había en la base, para el
 * «Ver todos».
 */
export function seccionesDeConsulta(
  def: DefConsulta,
  leidas: Fila[],
  ctx: Formateo & { total: number; filtro?: string | null }
): AnySection[] {
  const titulo = (ctx.filtro && def.filtros?.[ctx.filtro]?.titulo) || def.titulo;
  const filas = def.enJs ? leidas.filter((r) => def.enJs!(r, ctx.hoy)) : leidas;
  const total = def.enJs ? filas.length : Math.max(ctx.total, filas.length);
  const irA: AnySection = { id: "c1", kind: "irA", data: { destinos: [{ etiqueta: recortar(total > MAX_FILAS[def.forma] ? `Ver los ${total}` : def.seccion.etiqueta, 40), href: def.seccion.href }] } };

  if (!filas.length) return [{ id: "c0", kind: "emptyState", data: { mensaje: def.vacio } }, irA];

  // Los proyectos leídos son los únicos que se pueden enlazar con `?project=`.
  const proyectos = def.tabla === "projects" ? filas.map((r) => ({ id: String(r.id) })) : [];
  const href = (r: Fila) => rutaDeFila(`fila:${def.tabla}:${String(r.id)}`, r, proyectos);
  const max = MAX_FILAS[def.forma];
  const conTitulo = filas.flatMap((r) => {
    const t = def.nombre(r);
    return t ? [{ r, t: recortar(t.replace(/\s+/g, " "), LIMITES.itemTitulo) }] : [];
  });
  const visibles = conTitulo.slice(0, max);
  const encabezado = recortar(`${titulo} · ${total}`, 80);
  const detalle = (r: Fila) => {
    const d = def.detalle?.(r, ctx);
    return d ? recortar(d, LIMITES.itemDetalle) : null;
  };

  let seccion: AnySection;
  if (def.forma === "progreso" && def.progreso) {
    const p = def.progreso;
    seccion = {
      id: "c0",
      kind: "progreso",
      data: {
        titulo: encabezado,
        items: visibles.map(({ r, t }) => {
          const actual = Number(r[p.actual]) || 0;
          const meta = Number(r[p.meta]) || 0;
          const f = (v: number) => formatear(v, p.formato, ctx.moneda, ctx.locale, 18) ?? String(v);
          return {
            id: String(r.id),
            titulo: t,
            detalle: detalle(r),
            pct: meta > 0 ? Math.max(0, Math.min(100, Math.round((actual / meta) * 100))) : 0,
            valor: meta > 0 ? `${f(actual)} / ${f(meta)}` : `${f(actual)}${p.unidad ? ` ${p.unidad}` : ""}`,
            href: href(r)
          };
        })
      }
    };
  } else if (def.forma === "agenda" && def.agenda) {
    const a = def.agenda;
    const items = visibles
      .flatMap(({ r, t }) => {
        const inicio = hora(r[a.inicio]);
        return inicio ? [{ id: String(r.id), inicio, fin: hora(r[a.fin]), titulo: t, detalle: detalle(r), href: href(r) }] : [];
      })
      .sort((x, y) => x.inicio.localeCompare(y.inicio));
    seccion = { id: "c0", kind: "agenda", data: { titulo: def.titulo, items } };
  } else {
    seccion = {
      id: "c0",
      kind: "lista",
      data: {
        titulo: encabezado,
        items: visibles.map(({ r, t }) => {
          const e = def.estado?.(r);
          return { id: String(r.id), titulo: t, detalle: detalle(r), estado: e ? recortar(e, LIMITES.itemEstado) : null, href: href(r) };
        })
      }
    };
  }
  return total > max ? [seccion, irA] : [seccion];
}
