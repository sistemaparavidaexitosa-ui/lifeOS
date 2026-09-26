// De lo que el modelo propone a lo que la persona confirma (D-203). Puro,
// probado en tests/domain/centro-escritura-cambio.test.ts.
//
// TRES MOMENTOS, TRES FUNCIONES:
//  - `validarCambio`: en el turno. Contra el registro, `ai_domains` y las
//    filas que las herramientas entregaron. Las refs llegan como
//    `fila:<tabla>:<uuid>` y salen como uuid.
//  - `aplicarCorrecciones`: la persona corrigió un campo en la tarjeta.
//  - `revalidarGuardado`: al pulsar Guardar, sobre lo que quedó en
//    `coach_proposals.payload`. No se confía ni en el navegador ni en que la
//    base no se haya tocado: se vuelve a pasar por el registro.
//
// LOS CAMPOS SON VALORES DEL MODELO. Es la excepción explícita a la regla de
// oro (como el `monto` de D-202), y por eso nada de esto escribe: solo decide
// qué se le enseña a la persona para que ella decida.

import type { Domain } from "../../insights/types.ts";
import {
  ESCRITURA_POR_TABLA,
  OPERACIONES,
  camposDe,
  entradaDe,
  type CampoDeEscritura,
  type EntradaDeEscritura,
  type Operacion,
  type TablaEscribible
} from "./registro.ts";

export type Valor = string | number | null;

export interface CambioGuardado {
  operacion: Operacion;
  tabla: TablaEscribible;
  id: string | null;
  campos: Record<string, Valor>;
  antes: Record<string, unknown> | null;
}

export interface CambioValidado extends CambioGuardado {
  /** Campos que el modelo mandó y no se pueden escribir. Van al log. */
  ignorados: string[];
}

export interface ContextoDeCambio {
  filas: ReadonlyMap<string, Record<string, unknown>>;
  autorizados: readonly Domain[];
}

type R<T> = { ok: true } & T | { ok: false; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILA = /^fila:([a-z_]+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function esFecha(v: string): boolean {
  if (!ISO.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Un valor de campo, saneado. `modo: "turno"` = la ref es `fila:…` y tiene que
 * estar en las filas leídas; `modo: "guardado"` = la ref ya es un uuid.
 */
function valorDe(
  nombre: string,
  c: CampoDeEscritura,
  crudo: unknown,
  modo: "turno" | "guardado",
  filas: ReadonlyMap<string, Record<string, unknown>>
): R<{ valor: Valor }> {
  const mal = (por: string): { ok: false; reason: string } => ({ ok: false, reason: `«${nombre}» ${por}.` });
  if (crudo === null || crudo === undefined || crudo === "") {
    if (c.obligatorio) return { ok: false, reason: `«${c.etiqueta}» no puede quedar vacío.` };
    return { ok: true, valor: null };
  }
  switch (c.tipo) {
    case "texto": {
      if (typeof crudo !== "string") return mal("no es texto");
      const t = crudo.trim();
      if (c.obligatorio && !t) return { ok: false, reason: `«${c.etiqueta}» no puede quedar vacío.` };
      if (c.max !== undefined && t.length > c.max) return mal(`pasa de ${c.max} caracteres`);
      return { ok: true, valor: t };
    }
    case "numero":
    case "entero": {
      const n = typeof crudo === "number" ? crudo : typeof crudo === "string" && crudo.trim() !== "" ? Number(crudo) : Number.NaN;
      if (!Number.isFinite(n)) return mal("no es un número");
      if (c.tipo === "entero" && !Number.isInteger(n)) return mal("no es un entero");
      if (c.min !== undefined && n < c.min) return mal(`es menor que ${c.min}`);
      if (c.max !== undefined && n > c.max) return mal(`es mayor que ${c.max}`);
      return { ok: true, valor: n };
    }
    case "fecha":
      return typeof crudo === "string" && esFecha(crudo) ? { ok: true, valor: crudo } : mal("no es una fecha AAAA-MM-DD");
    case "opcion":
      return typeof crudo === "string" && (c.opciones ?? []).includes(crudo) ? { ok: true, valor: crudo } : mal("no es una opción válida");
    case "ref": {
      if (typeof crudo !== "string") return mal("no es una fila");
      if (modo === "guardado") return UUID.test(crudo) ? { ok: true, valor: crudo } : mal("no es un id");
      const m = FILA.exec(crudo);
      if (!m || m[1] !== c.refTabla) return mal(`tiene que ser una fila de ${c.refTabla}`);
      if (!filas.has(crudo)) return { ok: false, reason: `${crudo} no se leyó en este turno.` };
      return { ok: true, valor: m[2]! };
    }
  }
}

function objeto(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Pasa los campos de una operación por el registro. Los desconocidos, a `ignorados`. */
function sanearCampos(
  entrada: EntradaDeEscritura & { tabla: TablaEscribible },
  operacion: "crear" | "editar",
  crudos: Record<string, unknown>,
  modo: "turno" | "guardado",
  filas: ReadonlyMap<string, Record<string, unknown>>
): R<{ campos: Record<string, Valor>; ignorados: string[] }> {
  const permitidos = new Map(camposDe(entrada, operacion));
  const campos: Record<string, Valor> = {};
  const ignorados: string[] = [];
  for (const [nombre, crudo] of Object.entries(crudos)) {
    const c = permitidos.get(nombre);
    if (!c) {
      ignorados.push(nombre);
      continue;
    }
    // Al editar nada es obligatorio: viaja lo que cambia. Pero vaciar un
    // obligatorio tampoco se puede.
    const v = valorDe(nombre, c, crudo, modo, filas);
    if (!v.ok) return v;
    campos[nombre] = v.valor;
  }
  if (operacion === "crear") {
    for (const [nombre, c] of permitidos) {
      if (c.obligatorio && (campos[nombre] === undefined || campos[nombre] === null)) {
        return { ok: false, reason: `${entrada.tabla}: falta «${nombre}».` };
      }
    }
  }
  return { ok: true, campos, ignorados };
}

export function validarCambio(crudo: unknown, ctx: ContextoDeCambio): R<{ cambio: CambioValidado }> {
  const c = objeto(crudo);
  const operacion = OPERACIONES.find((o) => o === c.operacion);
  if (!operacion) return { ok: false, reason: `operación «${String(c.operacion)}» desconocida.` };

  if (operacion === "crear") {
    const tabla = typeof c.tabla === "string" ? c.tabla : "";
    const entrada = entradaDe(tabla, ctx.autorizados);
    if (!entrada || !entrada.operaciones.includes("crear")) return { ok: false, reason: `«${tabla}» no se puede escribir.` };
    const s = sanearCampos(entrada, "crear", objeto(c.campos), "turno", ctx.filas);
    if (!s.ok) return s;
    return { ok: true, cambio: { operacion, tabla: entrada.tabla, id: null, campos: s.campos, antes: null, ignorados: s.ignorados } };
  }

  const fila = typeof c.fila === "string" ? c.fila : "";
  const m = FILA.exec(fila);
  if (!m) return { ok: false, reason: `«${fila}» no es una fila.` };
  const antes = ctx.filas.get(fila);
  if (!antes) return { ok: false, reason: `${fila} no se leyó en este turno.` };
  const entrada = entradaDe(m[1]!, ctx.autorizados);
  if (!entrada || !entrada.operaciones.includes(operacion)) return { ok: false, reason: `«${m[1]}» no se puede escribir.` };

  if (operacion === "borrar") {
    return { ok: true, cambio: { operacion, tabla: entrada.tabla, id: m[2]!, campos: {}, antes, ignorados: [] } };
  }

  const s = sanearCampos(entrada, "editar", objeto(c.campos), "turno", ctx.filas);
  if (!s.ok) return s;
  // Solo lo que cambia de verdad. Un «edita» que deja todo igual no es un cambio.
  const campos = Object.fromEntries(Object.entries(s.campos).filter(([k, v]) => (antes[k] ?? null) !== v));
  if (!Object.keys(campos).length) return { ok: false, reason: `${fila}: la edición no cambia nada.` };
  return { ok: true, cambio: { operacion, tabla: entrada.tabla, id: m[2]!, campos, antes, ignorados: s.ignorados } };
}

export function aGuardar(c: CambioValidado): CambioGuardado {
  return { operacion: c.operacion, tabla: c.tabla, id: c.id, campos: c.campos, antes: c.antes };
}

export function revalidarGuardado(payload: unknown, autorizados: readonly Domain[]): R<{ cambio: CambioGuardado }> {
  const p = objeto(payload);
  const operacion = OPERACIONES.find((o) => o === p.operacion);
  const tabla = typeof p.tabla === "string" ? p.tabla : "";
  if (!operacion || !(tabla in ESCRITURA_POR_TABLA)) return { ok: false, reason: "Esta propuesta no se puede guardar." };
  const entrada = entradaDe(tabla, autorizados);
  if (!entrada) return { ok: false, reason: "Dominio no autorizado." };
  if (!entrada.operaciones.includes(operacion)) return { ok: false, reason: "Esta propuesta no se puede guardar." };

  const id = p.id === null || p.id === undefined ? null : String(p.id);
  if (operacion === "crear" ? id !== null : !id || !UUID.test(id)) return { ok: false, reason: "Esta propuesta no se puede guardar." };
  const antes = operacion === "crear" ? null : objeto(p.antes);

  if (operacion === "borrar") return { ok: true, cambio: { operacion, tabla: entrada.tabla, id, campos: {}, antes } };

  const s = sanearCampos(entrada, operacion, objeto(p.campos), "guardado", new Map());
  if (!s.ok) return { ok: false, reason: s.reason };
  // Guardado = ya pasó por el registro una vez. Un campo de más solo puede
  // venir de alguien que tocó el payload.
  if (s.ignorados.length) return { ok: false, reason: "Esta propuesta no se puede guardar." };
  if (operacion === "editar" && !Object.keys(s.campos).length) return { ok: false, reason: "Esta propuesta no se puede guardar." };
  return { ok: true, cambio: { operacion, tabla: entrada.tabla, id, campos: s.campos, antes } };
}

/**
 * Lo que la persona corrigió en la tarjeta. Solo campos que la operación puede
 * tocar, nunca refs (el proyecto o el cuaderno no se cambian desde aquí), y
 * con el mismo saneado que el turno.
 */
export function aplicarCorrecciones(c: CambioGuardado, correcciones: Record<string, string>): R<{ cambio: CambioGuardado }> {
  if (!Object.keys(correcciones).length) return { ok: true, cambio: c };
  if (c.operacion === "borrar") return { ok: false, reason: "Un borrado no se corrige." };
  const entrada = ESCRITURA_POR_TABLA[c.tabla] as EntradaDeEscritura;
  const permitidos = new Map(camposDe(entrada, c.operacion));
  const campos = { ...c.campos };
  for (const [nombre, crudo] of Object.entries(correcciones)) {
    const def = permitidos.get(nombre);
    if (!def || def.tipo === "ref") return { ok: false, reason: `«${nombre}» no se puede corregir aquí.` };
    const v = valorDe(nombre, def, crudo, "guardado", new Map());
    if (!v.ok) return v;
    campos[nombre] = v.valor;
  }
  return { ok: true, cambio: { ...c, campos } };
}
