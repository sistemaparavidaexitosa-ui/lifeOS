// Captura en lenguaje natural para la lista de Execution.
//
// «llamar a Ana mañana alta» crea la tarea «llamar a Ana» con fecha de mañana
// y prioridad alta. Sin IA: un puñado de reglas que cubren lo que se teclea en
// el iPhone con una mano —hoy, mañana, el día de la semana, una fecha corta—
// y nada más. Lo que no se reconoce se queda en el título; nunca se adivina.
//
// Solo se leen palabras SUELTAS al final o al principio del texto: «revisar
// el informe de mañana» no debe perder su «mañana» si va en medio de la frase.
// Por eso se consumen tokens desde los extremos y se para en el primero que no
// es una marca.

import { addDaysISO } from "../datetime.ts";
import type { Priority } from "../types.ts";

export interface CapturaInterpretada {
  titulo: string;
  due: string | null;
  priority: Priority | null;
  urgent: boolean;
}

const DIAS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6
};

const PRIORIDADES: Record<string, Priority> = {
  alta: "High",
  media: "Medium",
  baja: "Low"
};

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Día de la semana (0 = domingo) de una fecha ISO, sin depender de la zona horaria. */
function diaDeSemana(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** «15/11» o «15-11»: el próximo 15 de noviembre que no haya pasado. */
function fechaCorta(token: string, hoy: string): string | null {
  const m = /^(\d{1,2})[/-](\d{1,2})$/.exec(token);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  let anio = Number(hoy.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  let iso = `${anio}-${pad(mes)}-${pad(dia)}`;
  // Fechas imposibles (31/02) se rechazan en vez de desbordarse a marzo.
  const comprobar = new Date(`${iso}T00:00:00Z`);
  if (comprobar.getUTCDate() !== dia) return null;
  if (iso < hoy) {
    anio += 1;
    iso = `${anio}-${pad(mes)}-${pad(dia)}`;
  }
  return iso;
}

function fechaDe(token: string, hoy: string): string | null {
  if (token === "hoy") return hoy;
  if (token === "manana") return addDaysISO(hoy, 1);
  if (token === "pasado") return addDaysISO(hoy, 2);
  const dia = DIAS[token];
  if (dia !== undefined) {
    // El próximo día con ese nombre; «lunes» dicho un lunes es el de la semana
    // que viene, no hoy (para hoy está «hoy»).
    const delta = (dia - diaDeSemana(hoy) + 7) % 7 || 7;
    return addDaysISO(hoy, delta);
  }
  return fechaCorta(token, hoy);
}

export function interpretarCaptura(texto: string, hoy: string): CapturaInterpretada {
  const tokens = texto.trim().split(/\s+/).filter(Boolean);
  let due: string | null = null;
  let priority: Priority | null = null;
  let urgent = false;

  // Una marca se reconoce como mucho una vez: «alta baja» deja «baja» en el
  // título en vez de que la segunda pise a la primera sin avisar.
  function consumir(token: string): boolean {
    if (token === "!" || token === "!!") {
      if (urgent) return false;
      urgent = true;
      return true;
    }
    const t = sinAcentos(token).replace(/[.,;]$/, "");
    const prioridad = PRIORIDADES[t];
    if (prioridad) {
      if (priority) return false;
      priority = prioridad;
      return true;
    }
    const fecha = fechaDe(t, hoy);
    if (fecha) {
      if (due) return false;
      due = fecha;
      return true;
    }
    return false;
  }

  const ultimo = () => tokens[tokens.length - 1] ?? "";
  while (tokens.length > 1 && consumir(ultimo())) tokens.pop();
  // «para» y «el» sueltos que quedan colgando: «llamar a Ana para el viernes».
  while (tokens.length > 1 && due && /^(para|el)$/i.test(ultimo())) tokens.pop();
  while (tokens.length > 1 && consumir(tokens[0] ?? "")) tokens.shift();

  return { titulo: tokens.join(" "), due, priority, urgent };
}
