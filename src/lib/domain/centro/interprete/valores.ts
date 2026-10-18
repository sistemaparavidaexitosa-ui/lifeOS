// src/lib/domain/centro/interprete/valores.ts
// Fechas, números y opciones dichos con palabras (D-205). Puro, probado en
// tests/domain/centro-interprete-valores.test.ts.
//
// Todo recibe texto YA normalizado (`normalizar`) y devuelve, además del
// valor, la `frase` que consumió: el intérprete la quita del texto para que no
// acabe dentro del título («llamar a juan manana» → título «llamar a juan»).
//
// ANTE LA DUDA, NADA. Una fecha que no existe («31 de febrero») no se corrige
// a la más parecida: se devuelve `null` y el turno se lo pasa a la IA.

import { comoPalabra } from "./normalizar.ts";

export interface Hallazgo<T> {
  valor: T;
  /** El trozo normalizado que se consumió. */
  frase: string;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function aFecha(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mas(hoy: string, dias: number): string {
  const d = aFecha(hoy);
  d.setUTCDate(d.getUTCDate() + dias);
  return iso(d);
}

/** `null` si el día no existe en ese mes (31 de febrero). */
function fechaValida(anio: number, mes: number, dia: number): string | null {
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? iso(d) : null;
}

function buscar(n: string, patron: string): RegExpExecArray | null {
  return new RegExp(`(?<![a-z0-9])(?:${patron})(?![a-z0-9])`).exec(n);
}

export function extraerFecha(n: string, hoy: string): Hallazgo<string> | null {
  const h = aFecha(hoy);
  const anioHoy = h.getUTCFullYear();
  const mesHoy = h.getUTCMonth() + 1;
  const diaHoy = h.getUTCDate();

  let m = buscar(n, "(\\d{4})-(\\d{2})-(\\d{2})");
  if (m) {
    const v = fechaValida(Number(m[1]), Number(m[2]), Number(m[3]));
    return v ? { valor: v, frase: m[0] } : null;
  }

  m = buscar(n, `(?:el )?(\\d{1,2}) de (${MESES.join("|")})(?: de (\\d{4}))?`);
  if (m) {
    const dia = Number(m[1]);
    const mes = MESES.indexOf(m[2]!) + 1;
    // Sin año: el próximo que llega. «3 de enero» dicho en octubre es el que viene.
    const anio = m[3] ? Number(m[3]) : mes > mesHoy || (mes === mesHoy && dia >= diaHoy) ? anioHoy : anioHoy + 1;
    const v = fechaValida(anio, mes, dia);
    return v ? { valor: v, frase: m[0] } : null;
  }

  m = buscar(n, "pasado manana");
  if (m) return { valor: mas(hoy, 2), frase: m[0] };
  // «en la mañana» es una hora del día, no mañana.
  m = buscar(n, "(?<!la )manana");
  if (m) return { valor: mas(hoy, 1), frase: m[0] };
  m = buscar(n, "hoy");
  if (m) return { valor: hoy, frase: m[0] };
  m = buscar(n, "ayer");
  if (m) return { valor: mas(hoy, -1), frase: m[0] };

  m = buscar(n, "en (\\d{1,3}) dias?");
  if (m) return { valor: mas(hoy, Number(m[1])), frase: m[0] };

  m = buscar(n, "(?:la )?(?:proxima semana|semana que viene)");
  if (m) {
    // El lunes que viene. Un domingo, mañana.
    const hasta = ((8 - h.getUTCDay()) % 7) || 7;
    return { valor: mas(hoy, hasta), frase: m[0] };
  }

  m = buscar(n, `(?:el )?(${DIAS.join("|")})`);
  if (m) {
    // El mismo día de la semana que hoy es el de la semana que viene: quien
    // dice «el sábado» un sábado no está hablando de hoy.
    const hasta = ((DIAS.indexOf(m[1]!) - h.getUTCDay() + 7) % 7) || 7;
    return { valor: mas(hoy, hasta), frase: m[0] };
  }

  m = buscar(n, "el (\\d{1,2})(?! de)");
  if (m) {
    const dia = Number(m[1]);
    const [anio, mes] = dia >= diaHoy ? [anioHoy, mesHoy] : mesHoy === 12 ? [anioHoy + 1, 1] : [anioHoy, mesHoy + 1];
    const v = fechaValida(anio, mes, dia);
    return v ? { valor: v, frase: m[0] } : null;
  }

  return null;
}

export function extraerNumero(n: string, unidades: readonly string[]): Hallazgo<number> | null {
  if (!unidades.length) return null;
  const alternativas = [...unidades].sort((a, b) => b.length - a.length).map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const m = new RegExp(`(?<![a-z0-9.,])(\\d+(?:[.,]\\d+)?) ?(?:${alternativas.join("|")})(?![a-z0-9])`).exec(n);
  if (!m) return null;
  const valor = Number(m[1]!.replace(",", "."));
  return Number.isFinite(valor) ? { valor, frase: m[0] } : null;
}

export function extraerOpcion(n: string, sinonimos: Readonly<Record<string, readonly string[]>>): Hallazgo<string> | null {
  let mejor: Hallazgo<string> | null = null;
  for (const [valor, frases] of Object.entries(sinonimos)) {
    for (const f of frases) {
      if ((mejor && f.length <= mejor.frase.length) || !comoPalabra(f).test(n)) continue;
      mejor = { valor, frase: f };
    }
  }
  return mejor;
}
