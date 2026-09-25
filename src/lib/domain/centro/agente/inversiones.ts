// src/lib/domain/centro/agente/inversiones.ts
// La capacidad «inversiones», sin red (D-202). Pura, probada en
// tests/domain/centro-agente-inversiones.test.ts.
//
// Todas las cifras las calcula esto, con la misma curva que /investments: el
// modelo solo elige la vista y la posición. Una posición que no está entre
// las que la RLS devolvió no existe para el Centro.

import { curvaDePosicion, curvaGlobal, rendimientoPct, recortarCurva, type PosicionConMovimientos, type PuntoDeCurva, type TipoDeMovimiento } from "../../money/curva-inversion.ts";
import { fdate, money } from "../../../format.ts";
import { LIMITES, recortar } from "../runtime/secciones.ts";
import type { AnySection } from "../runtime/types.ts";

export const VISTAS_INVERSION = ["global", "posicion", "movimientos"] as const;
export type VistaInversion = (typeof VISTAS_INVERSION)[number];

export interface ParametrosInversiones {
  vista: VistaInversion;
  posicion: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MOVIMIENTOS = 10;

export const NOMBRE_DE_TIPO: Record<TipoDeMovimiento, string> = {
  aportacion: "Aportación",
  retiro: "Retiro",
  rendimiento: "Rendimiento",
  valuacion: "Valuación"
};

export function leerParametrosInversiones(raw: unknown): ParametrosInversiones {
  const r = (raw ?? {}) as Record<string, unknown>;
  const vista = (VISTAS_INVERSION as readonly string[]).includes(r.vista as string) ? (r.vista as VistaInversion) : "global";
  const crudo = typeof r.posicion === "string" ? r.posicion.replace(/^fila:investments:/, "") : "";
  return { vista, posicion: UUID.test(crudo) ? crudo : null };
}

function nota(p: PuntoDeCurva, moneda: string, locale: string, extra: string | null): string {
  const rend = rendimientoPct(p);
  const partes = [
    `Capital aportado ${money(p.capital, moneda, locale)}`,
    rend === null ? null : `rendimiento ${rend >= 0 ? "+" : ""}${rend}%`,
    `al ${fdate(p.fecha, locale)}`,
    extra
  ].filter(Boolean);
  return recortar(partes.join(" · "), 160);
}

const serieDe = (puntos: PuntoDeCurva[]) => (puntos.length >= 2 ? recortarCurva(puntos).map((p) => ({ x: p.fecha, y: p.valor })) : []);

const vacio = (id: string, title: string, mensaje: string): AnySection => ({ id, kind: "emptyState", title, data: { mensaje } });

export function seccionesDeInversiones(e: {
  parametros: ParametrosInversiones;
  moneda: string;
  locale: string;
  hoy: string;
  posiciones: PosicionConMovimientos[];
}): AnySection[] {
  const { parametros: p } = e;
  const elegida = p.posicion ? e.posiciones.find((x) => x.id === p.posicion) ?? null : null;
  if (p.posicion && !elegida) return [vacio("inversiones-posicion", "Inversiones", "No encuentro esa inversión.")];

  if (p.vista === "movimientos") {
    const fuente = elegida ? [elegida] : e.posiciones;
    const todos = fuente.flatMap((x) => x.movimientos.map((m) => ({ m, x })));
    todos.sort((a, b) =>
      a.m.occurred_on === b.m.occurred_on ? b.m.created_at.localeCompare(a.m.created_at) : b.m.occurred_on.localeCompare(a.m.occurred_on)
    );
    if (!todos.length) return [vacio("inversiones-movimientos", "Movimientos", "Aún no hay movimientos registrados.")];
    return [{
      id: "inversiones-movimientos",
      kind: "table",
      data: {
        titulo: elegida ? recortar(`Movimientos · ${elegida.name}`, 80) : "Últimos movimientos",
        columnas: ["Fecha", "Posición", "Tipo", "Monto"],
        filas: todos.slice(0, MAX_MOVIMIENTOS).map(({ m, x }, i) => ({
          id: m.id ?? `${x.id}-${i}`,
          celdas: [
            fdate(m.occurred_on, e.locale),
            recortar(x.name, LIMITES.celda),
            NOMBRE_DE_TIPO[m.kind],
            `${m.kind === "retiro" ? "−" : ""}${money(m.amount, x.currency, e.locale)}`
          ],
          href: "/investments"
        }))
      }
    }];
  }

  if (p.vista === "posicion" && elegida) {
    const curva = curvaDePosicion(elegida.movimientos, e.hoy);
    const ultimo = curva[curva.length - 1];
    if (!ultimo) return [vacio("inversiones-posicion", recortar(elegida.name, 80), "Esta inversión aún no tiene movimientos.")];
    return [{
      id: "inversiones-posicion",
      kind: "portfolio",
      title: recortar(elegida.name, 80),
      data: { total: money(ultimo.valor, elegida.currency, e.locale), nota: nota(ultimo, elegida.currency, e.locale, null), serie: serieDe(curva) }
    }];
  }

  const g = curvaGlobal(e.posiciones, e.moneda, e.hoy);
  const ultimo = g.puntos[g.puntos.length - 1];
  if (!ultimo) {
    const mensaje = g.fuera > 0 ? "Tus inversiones están en otra moneda y no se suman aquí." : "Aún no registras inversiones.";
    return [vacio("inversiones-global", "Tus inversiones", mensaje)];
  }
  const extra = g.fuera > 0 ? `${g.fuera} ${g.fuera === 1 ? "posición en otra moneda no suma" : "posiciones en otra moneda no suman"}` : null;
  return [{
    id: "inversiones-global",
    kind: "portfolio",
    title: "Tus inversiones",
    data: { total: money(ultimo.valor, e.moneda, e.locale), nota: nota(ultimo, e.moneda, e.locale, extra), serie: serieDe(g.puntos) }
  }];
}
