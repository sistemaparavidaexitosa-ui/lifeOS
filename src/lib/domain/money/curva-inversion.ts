// src/lib/domain/money/curva-inversion.ts
// La evolución de una inversión a partir de sus movimientos (D-201). Puro,
// probado en tests/domain/curva-inversion.test.ts.
//
// LA MISMA SEMÁNTICA VIVE DOS VECES. Aquí, para dibujar la curva; y en SQL
// (`recalcular_inversion`, migración 0077), para el resumen que guarda
// `investments`. Las dos se prueban con `CASOS_COMPARTIDOS`: si una cambia sin
// la otra, la página diría un valor y la curva otro.
//
// Una VALUACIÓN es el valor al cierre de su día: los flujos de esa misma fecha
// ya están dentro. Lo que se aporta, rinde o retira DESPUÉS se le suma o resta.
// Un RENDIMIENTO sube el valor y no el capital: si se cobró fuera, la persona
// registra además un retiro.

import { round2 } from "../budget.ts";

export const TIPOS_DE_MOVIMIENTO = ["aportacion", "retiro", "rendimiento", "valuacion"] as const;
export type TipoDeMovimiento = (typeof TIPOS_DE_MOVIMIENTO)[number];

export interface MovimientoPuro {
  id?: string;
  kind: TipoDeMovimiento;
  amount: number;
  occurred_on: string;
  created_at: string;
  note?: string;
}

export interface PuntoDeCurva {
  fecha: string;
  valor: number;
  capital: number;
}

export interface PosicionConMovimientos {
  id: string;
  name: string;
  currency: string;
  movimientos: MovimientoPuro[];
}

/** El tope de `portfolio.serie` en el validador del runtime. */
export const MAX_PUNTOS = 400;

const SIGNO: Record<TipoDeMovimiento, number> = { aportacion: 1, rendimiento: 1, retiro: -1, valuacion: 0 };

function ordenados(movs: MovimientoPuro[]): MovimientoPuro[] {
  return [...movs].sort((a, b) =>
    a.occurred_on === b.occurred_on ? a.created_at.localeCompare(b.created_at) : a.occurred_on.localeCompare(b.occurred_on)
  );
}

export function estadoAl(movs: MovimientoPuro[], fecha: string): { valor: number; capital: number } {
  const hasta = ordenados(movs).filter((x) => x.occurred_on <= fecha);
  let capital = 0;
  let ultima: MovimientoPuro | null = null;
  for (const x of hasta) {
    if (x.kind === "aportacion") capital += x.amount;
    if (x.kind === "retiro") capital -= x.amount;
    if (x.kind === "valuacion") ultima = x; // ordenados: la última gana, y en empate la creada después
  }
  let valor = ultima ? ultima.amount : 0;
  for (const x of hasta) {
    if (x.kind === "valuacion") continue;
    if (ultima && x.occurred_on <= ultima.occurred_on) continue;
    valor += SIGNO[x.kind] * x.amount;
  }
  return { valor: round2(valor), capital: round2(capital) };
}

export function valorAl(movs: MovimientoPuro[], fecha: string): number {
  return estadoAl(movs, fecha).valor;
}

function fechasCon(movs: MovimientoPuro[], hasta: string): string[] {
  const fechas = [...new Set(movs.map((x) => x.occurred_on).filter((f) => f <= hasta))].sort();
  if (fechas.length && fechas[fechas.length - 1]! < hasta) fechas.push(hasta);
  return fechas;
}

export function curvaDePosicion(movs: MovimientoPuro[], hasta: string): PuntoDeCurva[] {
  return fechasCon(movs, hasta).map((fecha) => ({ fecha, ...estadoAl(movs, fecha) }));
}

export function curvaGlobal(
  posiciones: { currency: string; movimientos: MovimientoPuro[] }[],
  moneda: string,
  hasta: string
): { puntos: PuntoDeCurva[]; fuera: number } {
  const propias = posiciones.filter((p) => p.currency === moneda);
  const fuera = posiciones.length - propias.length;
  const fechas = fechasCon(propias.flatMap((p) => p.movimientos), hasta);
  const puntos = fechas.map((fecha) => {
    let valor = 0;
    let capital = 0;
    for (const p of propias) {
      const e = estadoAl(p.movimientos, fecha);
      valor += e.valor;
      capital += e.capital;
    }
    return { fecha, valor: round2(valor), capital: round2(capital) };
  });
  return { puntos, fuera };
}

/** (valor − capital) / capital, en % con un decimal. `null` sin capital que medir. */
export function rendimientoPct(p: { valor: number; capital: number }): number | null {
  if (p.capital <= 0) return null;
  return Math.round(((p.valor - p.capital) / p.capital) * 1000) / 10;
}

/** Como mucho `max` puntos, repartidos, con el primero y el último siempre dentro. */
export function recortarCurva<T>(puntos: T[], max: number = MAX_PUNTOS): T[] {
  if (puntos.length <= max) return puntos;
  return Array.from({ length: max }, (_, i) => puntos[Math.round((i * (puntos.length - 1)) / (max - 1))]!);
}

export function retiroPermitido(movs: MovimientoPuro[], nuevo: { amount: number; occurred_on: string }): boolean {
  return valorAl(movs, nuevo.occurred_on) - nuevo.amount >= -0.005;
}

/**
 * La tabla que prueban las DOS implementaciones (esta y el trigger). Fechas
 * fijas, `created_at` explícito donde el orden importa.
 */
export const CASOS_COMPARTIDOS: { nombre: string; movs: MovimientoPuro[]; esperado: { valor: number; capital: number } }[] = [
  {
    nombre: "C1 sin valuación",
    movs: [
      { kind: "aportacion", amount: 1000, occurred_on: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
      { kind: "aportacion", amount: 500, occurred_on: "2026-01-02", created_at: "2026-01-02T10:00:00Z" },
      { kind: "rendimiento", amount: 20, occurred_on: "2026-01-03", created_at: "2026-01-03T10:00:00Z" },
      { kind: "retiro", amount: 100, occurred_on: "2026-01-04", created_at: "2026-01-04T10:00:00Z" }
    ],
    esperado: { valor: 1420, capital: 1400 }
  },
  {
    nombre: "C2 valuación y luego flujo",
    movs: [
      { kind: "aportacion", amount: 1000, occurred_on: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
      { kind: "valuacion", amount: 1100, occurred_on: "2026-01-02", created_at: "2026-01-02T10:00:00Z" },
      { kind: "aportacion", amount: 200, occurred_on: "2026-01-03", created_at: "2026-01-03T10:00:00Z" }
    ],
    esperado: { valor: 1300, capital: 1200 }
  },
  {
    nombre: "C3 flujo el mismo día que la valuación",
    movs: [
      { kind: "aportacion", amount: 1000, occurred_on: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
      { kind: "aportacion", amount: 500, occurred_on: "2026-01-02", created_at: "2026-01-02T11:00:00Z" },
      { kind: "valuacion", amount: 1600, occurred_on: "2026-01-02", created_at: "2026-01-02T10:00:00Z" }
    ],
    esperado: { valor: 1600, capital: 1500 }
  },
  {
    nombre: "C4 dos valuaciones el mismo día",
    movs: [
      { kind: "valuacion", amount: 900, occurred_on: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
      { kind: "valuacion", amount: 950, occurred_on: "2026-01-01", created_at: "2026-01-01T11:00:00Z" }
    ],
    esperado: { valor: 950, capital: 0 }
  },
  {
    nombre: "C5 retiro después de valuar",
    movs: [
      { kind: "aportacion", amount: 1000, occurred_on: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
      { kind: "valuacion", amount: 1200, occurred_on: "2026-01-02", created_at: "2026-01-02T10:00:00Z" },
      { kind: "retiro", amount: 300, occurred_on: "2026-01-03", created_at: "2026-01-03T10:00:00Z" }
    ],
    esperado: { valor: 900, capital: 700 }
  }
];
