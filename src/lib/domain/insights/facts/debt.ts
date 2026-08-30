// src/lib/domain/insights/facts/debt.ts
// Extractor de hechos de Deudas — función pura: sin Supabase, sin red, sin
// `new Date()`. El día de corte entra como parámetro (D-016/D-018).
//
// `simulateSingleDebt` viene de domain/debt.ts, que es el mismo simulador que
// usa la pantalla. El motor no puede decir "tardarás 9 años" si el simulador
// que el usuario tiene al lado dice otra cosa.
//
// Lo que este archivo NO hace, y conviene decirlo: comparar métodos de pago
// (avalancha, bola de nieve, cash flow). El orden entre deudas solo cambia algo
// cuando hay dinero EXTRA que repartir, y cuánto extra puede poner el usuario
// no está en ninguna tabla. Inventar una cifra para que la comparación tenga
// gracia sería exactamente lo que el motor tiene prohibido. Esa comparación ya
// vive en el simulador de /debt, donde el usuario pone su propio número.

import { simulateSingleDebt } from "../../debt.ts";
import { diffDays } from "../../datetime.ts";
import type { DebtLike } from "../../types.ts";
import { clampWeight, type Fact } from "../types.ts";
import { days, round2 } from "./shared.ts";

export interface DebtPaymentLike {
  /** `journal_entries.debt_id`. */
  debtId: string;
  /** `entry_date`. */
  date: string;
}

export interface DebtSnapshot {
  debts: DebtLike[];
  /** Pagos YA ligados a una deuda. Un gasto sin `debt_id` no cuenta aquí. */
  payments: DebtPaymentLike[];
}

/** Interés que corre este mes sobre un saldo, con la tasa anual de la deuda. */
function monthlyInterest(debt: DebtLike): number {
  return (debt.balance * debt.rate) / 100 / 12;
}

function isLive(debt: DebtLike): boolean {
  return debt.balance > 0;
}

/**
 * El pago mínimo no cubre ni los intereses.
 *
 * Es el peor hecho que este módulo puede encontrar y por eso pesa 1 siempre: no
 * es que la deuda tarde mucho, es que CRECE. Nadie lo ve mirando la pantalla,
 * porque ahí el interés mensual y el pago mínimo son dos números en dos
 * recuadros distintos y la resta hay que hacerla de cabeza.
 *
 * Se separa del horizonte normal a propósito. `simulateSingleDebt` tiene un
 * tope de 600 meses, así que este caso saldría por ahí como "tarda 600 meses",
 * que es una manera pésima de decir "nunca": suena a mucho tiempo, no a
 * imposible.
 */
function neverAmortizesFacts(snapshot: DebtSnapshot): Fact[] {
  const facts: Fact[] = [];
  for (const debt of snapshot.debts) {
    if (!isLive(debt)) continue;
    const interest = monthlyInterest(debt);
    if (debt.minPayment > interest) continue;

    facts.push({
      id: `debt.min-never-amortizes.${debt.id}`,
      domain: "debt",
      label:
        `"${debt.name}": el pago mínimo de ${round2(debt.minPayment)} no cubre los ${round2(interest)} de interés que genera al mes ` +
        `(saldo ${round2(debt.balance)} al ${debt.rate} % anual). Pagando solo el mínimo, el saldo sube en vez de bajar`,
      weight: 1,
      refs: [{ table: "debts", id: debt.id }]
    });
  }
  return facts;
}

/**
 * Cuánto tarda y cuánto cuesta pagar solo el mínimo.
 *
 * La pantalla dice el interés de ESTE mes; nadie suma los del resto. Tres años
 * es el umbral porque por debajo la respuesta es "un rato" y no cambia ninguna
 * decisión; a partir de ahí el interés acumulado empieza a competir con el
 * saldo mismo, y eso sí se decide distinto.
 */
const HORIZON_FLOOR_MONTHS = 36;

function minimumOnlyFacts(snapshot: DebtSnapshot): Fact[] {
  const facts: Fact[] = [];
  for (const debt of snapshot.debts) {
    if (!isLive(debt)) continue;
    // El caso patológico ya tiene su propio hecho; no se cuenta dos veces.
    if (debt.minPayment <= monthlyInterest(debt)) continue;

    // 0 = "sin aportar nada extra": el simulador ya toma el mínimo como suelo.
    const { months, interest } = simulateSingleDebt(debt, 0);
    if (months < HORIZON_FLOOR_MONTHS) continue;

    facts.push({
      id: `debt.min-only-horizon.${debt.id}`,
      domain: "debt",
      label:
        `"${debt.name}": pagando solo el mínimo de ${round2(debt.minPayment)} al mes, quedan ${months} meses ` +
        `y ${round2(interest)} de interés por pagar sobre un saldo de ${round2(debt.balance)}`,
      // Diez años pesa 1.
      weight: clampWeight(months / 120),
      refs: [{ table: "debts", id: debt.id }]
    });
  }
  return facts;
}

/**
 * La deuda cuya tasa se despega de las demás.
 *
 * La pantalla muestra "mayor tasa" como un número suelto: dice cuánto, no cuál,
 * y sobre todo no dice por cuánto. La distancia es lo que decide — con dos
 * deudas al 24 % y al 22 % da casi igual por cuál empezar; con una al 60 % y
 * otra al 12 %, cada peso extra tiene un solo destino sensato.
 *
 * Hace falta más de una deuda: con una sola, "la de mayor tasa" no es un
 * hallazgo, es la única que hay.
 */
const RATE_GAP_POINTS = 10;

function rateOutlierFacts(snapshot: DebtSnapshot): Fact[] {
  const live = snapshot.debts.filter(isLive);
  if (live.length < 2) return [];

  const ordered = [...live].sort((a, b) => b.rate - a.rate);
  const worst = ordered[0];
  const next = ordered[1];
  if (!worst || !next) return [];

  const gap = round2(worst.rate - next.rate);
  if (gap < RATE_GAP_POINTS) return [];

  return [
    {
      id: `debt.rate-outlier.${worst.id}`,
      domain: "debt",
      label:
        `"${worst.name}" está al ${worst.rate} % anual, ${gap} puntos por encima de la siguiente ` +
        `("${next.name}", al ${next.rate} %). Genera ${round2(monthlyInterest(worst))} de interés al mes`,
      // Treinta puntos de diferencia pesa 1.
      weight: clampWeight(gap / 30),
      refs: [
        { table: "debts", id: worst.id },
        { table: "debts", id: next.id }
      ]
    }
  ];
}

/**
 * Una deuda que se dejó de pagar — o de registrar, que desde aquí es lo mismo.
 *
 * SOLO se mira si esa deuda tiene algún pago ligado ALGUNA VEZ. Quien paga por
 * fuera y no lo registra no tiene un problema de deuda, tiene otra manera de
 * llevar sus cuentas, y avisarle cada vez de algo que él sabe que está al
 * corriente es la forma de que deje de leer las recomendaciones. Es el mismo
 * criterio que el proyecto que nunca completó nada o la rutina que nunca se
 * ejecutó: sin un antes, no hay nada que haya cambiado.
 *
 * Por eso el hecho dice las dos lecturas posibles y no elige: el motor no puede
 * saber si el pago no ocurrió o no se anotó.
 */
const SILENT_AFTER_DAYS = 45;

function silentDebtFacts(snapshot: DebtSnapshot, todayISO: string): Fact[] {
  const facts: Fact[] = [];
  for (const debt of snapshot.debts) {
    if (!isLive(debt)) continue;

    const suyos = snapshot.payments.filter((p) => p.debtId === debt.id);
    if (!suyos.length) continue;

    const ultimo = suyos.reduce((a, b) => (b.date > a.date ? b : a)).date;
    const silencio = diffDays(ultimo, todayISO);
    if (silencio < SILENT_AFTER_DAYS) continue;

    facts.push({
      id: `debt.silent.${debt.id}`,
      domain: "debt",
      label:
        `"${debt.name}" no registra ningún pago desde hace ${days(silencio)}, y sigue con un saldo de ${round2(debt.balance)} ` +
        `que genera ${round2(monthlyInterest(debt))} de interés al mes. Puede ser que el pago no se hiciera o que no se anotara`,
      // Cuatro meses de silencio pesa 1.
      weight: clampWeight(silencio / 120),
      refs: [{ table: "debts", id: debt.id }]
    });
  }
  return facts;
}

/** Todos los hechos de deuda, ordenados de más a menos anómalo. */
export function debtFacts(snapshot: DebtSnapshot, todayISO: string): Fact[] {
  return [
    ...neverAmortizesFacts(snapshot),
    ...minimumOnlyFacts(snapshot),
    ...rateOutlierFacts(snapshot),
    ...silentDebtFacts(snapshot, todayISO)
  ].sort((a, b) => b.weight - a.weight);
}
