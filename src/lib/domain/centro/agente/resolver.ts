// src/lib/domain/centro/agente/resolver.ts
// De una referencia a un valor (D-194). Puro, probado en
// tests/domain/centro-agente-resolver.test.ts.
//
// LO QUE NO SE LEYÓ NO SE ENSEÑA. Cada `fila:<tabla>:<uuid>` se busca en las
// filas que las herramientas entregaron en ESTE turno (bajo la RLS de la
// persona). Una fila inventada, o un campo que la fila no tiene, invalida ESE
// ítem —no el bloque, no el turno—; un bloque que se queda sin ítems no sale.
//
// EL ENLACE LO PONE EL SERVIDOR, NO EL MODELO. Se deriva de la tabla de la fila
// y pasa por `destinoValido`: una tabla sin sección en el menú (notas,
// comentarios) sale sin enlace, nunca con uno a una pantalla oculta.

import { destinoValido } from "../sugerencias.ts";
import { fdate, money } from "../../../format.ts";
import type { AnySection } from "../runtime/types.ts";
import type { BloqueGenerico, Formato } from "./contrato.ts";

export type Filas = ReadonlyMap<string, Record<string, unknown>>;

export interface ContextoDeResolucion {
  filas: Filas;
  moneda: string;
  locale: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tabla → sección. Lo que no está aquí no tiene enlace. */
const SECCION_DE_TABLA: Record<string, string> = {
  tasks: "/execution",
  task_groups: "/execution",
  task_history: "/execution",
  daily_plans: "/planning",
  weekly_reviews: "/planning",
  occupations: "/time",
  reminders: "/time",
  habits: "/development/routines",
  habit_logs: "/development/routines",
  routines: "/development/routines",
  routine_runs: "/development/routines",
  identity_profiles: "/development",
  identity_traits: "/development",
  habit_identity_traits: "/development",
  identity_scores: "/development",
  daily_reflections: "/development",
  personal_goals: "/development/goals",
  key_results: "/development/goals",
  books: "/development/library",
  book_notes: "/development/library",
  book_progress: "/development/library",
  reading_plan_weeks: "/development/library",
  nutrition_profiles: "/development/nutrition",
  food_entries: "/development/nutrition",
  body_measurements: "/development/nutrition",
  budgets: "/money/budget",
  budget_carryovers: "/money/budget",
  categories: "/money/budget",
  accounts: "/money",
  savings_goals: "/savings",
  financial_goals: "/goals",
  investments: "/investments",
  assets: "/wealth",
  liabilities: "/wealth",
  net_worth_snapshots: "/wealth",
  debts: "/debt",
  cashback_cards: "/cashback",
  cashback_redemptions: "/cashback",
  family_members: "/household"
};

function partes(fila: string): { tabla: string; id: string } {
  const [, tabla = "", id = ""] = fila.split(":");
  return { tabla, id };
}

/** Los proyectos que la persona puede enlazar: los que se leyeron, y los de sus tareas leídas. */
export function proyectosVistos(filas: Filas): { id: string }[] {
  const ids = new Set<string>();
  for (const [fila, r] of filas) {
    const { tabla, id } = partes(fila);
    if (tabla === "projects" && UUID.test(id)) ids.add(id);
    if (tabla === "tasks" && typeof r.project_id === "string" && UUID.test(r.project_id)) ids.add(r.project_id);
  }
  return [...ids].map((id) => ({ id }));
}

export function rutaDeFila(fila: string, registro: Record<string, unknown>, proyectos: { id: string }[]): string | null {
  const { tabla, id } = partes(fila);
  let href: string | null = null;
  if (tabla === "projects") href = `/execution?project=${id}`;
  else if (tabla === "tasks" && typeof registro.project_id === "string" && proyectos.some((p) => p.id === registro.project_id)) {
    href = `/execution?project=${registro.project_id}`;
  } else href = SECCION_DE_TABLA[tabla] ?? null;
  return href && destinoValido(href, proyectos) ? href : null;
}

export function formatear(valor: unknown, formato: Formato, moneda: string, locale: string): string | null {
  if (valor === null || valor === undefined) return null;
  if (formato === "texto") {
    const t = String(valor).trim().replace(/\s+/g, " ");
    return t ? t.slice(0, 160) : null;
  }
  if (formato === "fecha") {
    if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(valor)) return null;
    return fdate(valor.slice(0, 10), locale);
  }
  const n = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() !== "" ? Number(valor) : NaN;
  if (!Number.isFinite(n)) return null;
  if (formato === "dinero") return money(n, moneda, locale);
  if (formato === "porcentaje") return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
}

/** Un campo de una fila, como texto para pintar. Las fechas ISO se leen como fechas. */
function textoDe(r: Record<string, unknown>, campo: string, ctx: ContextoDeResolucion): string | null {
  if (!(campo in r)) return null;
  const v = r[campo];
  const esFecha = typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v);
  return formatear(v, esFecha ? "fecha" : "texto", ctx.moneda, ctx.locale);
}

export function resolverBloque(b: BloqueGenerico, id: string, ctx: ContextoDeResolucion): AnySection | null {
  const pv = proyectosVistos(ctx.filas);
  const leer = (fila: string) => ctx.filas.get(fila) ?? null;
  const idDe = (fila: string) => partes(fila).id;

  switch (b.kind) {
    case "lista": {
      const items = b.items.flatMap((it) => {
        const r = leer(it.fila);
        const titulo = r ? textoDe(r, it.titulo, ctx) : null;
        if (!r || !titulo) return [];
        return [{
          id: idDe(it.fila),
          titulo,
          detalle: it.detalle ? textoDe(r, it.detalle, ctx) : null,
          estado: it.estado ? textoDe(r, it.estado, ctx) : null,
          href: rutaDeFila(it.fila, r, pv)
        }];
      });
      return items.length ? { id, kind: "lista", data: { titulo: b.titulo, items } } : null;
    }
    case "metricas": {
      const items = b.items.flatMap((it) => {
        const r = leer(it.fila);
        const valor = r && it.campo in r ? formatear(r[it.campo], it.formato, ctx.moneda, ctx.locale) : null;
        return valor ? [{ etiqueta: it.etiqueta, valor }] : [];
      });
      return items.length ? { id, kind: "metricas", data: { titulo: b.titulo, items } } : null;
    }
    case "tabla": {
      const filas = b.filas.flatMap((fila) => {
        const r = leer(fila);
        if (!r) return [];
        const celdas = b.columnas.map((c) => (c.campo in r ? formatear(r[c.campo], c.formato, ctx.moneda, ctx.locale) : null) ?? "—");
        if (celdas.every((c) => c === "—")) return [];
        return [{ id: idDe(fila), celdas, href: rutaDeFila(fila, r, pv) }];
      });
      return filas.length
        ? { id, kind: "table", data: { titulo: b.titulo, columnas: b.columnas.map((c) => c.etiqueta), filas } }
        : null;
    }
    case "grafica": {
      const tablas = new Set(b.filas.map((f) => partes(f).tabla));
      if (tablas.size !== 1) return null;
      const puntos = b.filas.flatMap((fila) => {
        const r = leer(fila);
        const x = r?.[b.campoX];
        const y = typeof r?.[b.campoY] === "number" ? (r[b.campoY] as number) : Number(r?.[b.campoY]);
        return r && x !== undefined && x !== null && Number.isFinite(y) ? [{ x: String(x).slice(0, 40), y }] : [];
      });
      if (puntos.length < 2) return null;
      const unidad = b.formato === "dinero" ? ctx.moneda : b.formato === "porcentaje" ? "%" : "";
      return { id, kind: "chart", data: { titulo: b.titulo, tipo: b.tipo, unidad, puntos } };
    }
    case "tarjetas": {
      const items = b.items.flatMap((it) => {
        const r = leer(it.fila);
        const titulo = r ? textoDe(r, it.titulo, ctx) : null;
        if (!r || !titulo) return [];
        return [{ id: idDe(it.fila), titulo, detalle: it.detalle ? textoDe(r, it.detalle, ctx) : null, href: rutaDeFila(it.fila, r, pv) }];
      });
      return items.length ? { id, kind: "cards", data: { titulo: b.titulo, items } } : null;
    }
    case "linea": {
      const items = b.items.flatMap((it) => {
        const r = leer(it.fila);
        const fecha = r && it.fecha in r ? formatear(r[it.fecha], "fecha", ctx.moneda, ctx.locale) : null;
        const titulo = r ? textoDe(r, it.titulo, ctx) : null;
        if (!r || !fecha || !titulo) return [];
        return [{ id: idDe(it.fila), fecha, titulo, href: rutaDeFila(it.fila, r, pv) }];
      });
      return items.length ? { id, kind: "timeline", data: { titulo: b.titulo, items } } : null;
    }
  }
}
