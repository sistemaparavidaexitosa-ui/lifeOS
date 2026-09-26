// Cómo le fue a la persona con lo que el Centro propuso (D-204). Puro, probado
// en tests/domain/centro-agente-resultados.test.ts.
//
// Es la señal de aprendizaje: el modelo la lee en cada turno y decide si hay
// una preferencia que recordar. Solo conteos y etiquetas: ninguna cifra ni
// texto de los datos de la persona.
import { ESCRITURA_POR_TABLA, type EntradaDeEscritura } from "../escritura/registro.ts";

export const MAX_LINEAS_RESULTADOS = 12;
export const DIAS_RESULTADOS = 30;

export interface EntradaResultados {
  propuestas: { tipo: string; status: "accepted" | "dismissed"; tabla?: string; operacion?: string }[];
  correcciones: { tabla: string; campos: string[] }[];
  entendimiento: { resultado: string; tabla?: string; operacion?: string }[];
}

const TIPO: Record<string, string> = { tarea: "Tarea", bloque: "Bloque de tiempo", foco: "Foco", nota: "Nota", rutina: "Rutina", meta: "Meta" };
const VERBO: Record<string, string> = { crear: "Crear", editar: "Cambiar", borrar: "Borrar" };

const registro = ESCRITURA_POR_TABLA as Record<string, EntradaDeEscritura>;
const etiquetaTabla = (t: string) => registro[t]?.etiqueta ?? t;
const etiquetaCampo = (t: string, c: string) => registro[t]?.campos[c]?.etiqueta ?? c;
const veces = (n: number) => (n === 1 ? "1 vez" : `${n} veces`);

export function resumirResultados(e: EntradaResultados): string[] {
  const lineas: { peso: number; texto: string }[] = [];

  const grupos = new Map<string, { ok: number; no: number }>();
  for (const p of e.propuestas) {
    const clave = p.tipo === "cambio" && p.tabla && p.operacion ? `${VERBO[p.operacion] ?? p.operacion} · ${etiquetaTabla(p.tabla)}` : (TIPO[p.tipo] ?? p.tipo);
    const g = grupos.get(clave) ?? { ok: 0, no: 0 };
    if (p.status === "accepted") g.ok += 1;
    else g.no += 1;
    grupos.set(clave, g);
  }
  for (const [clave, g] of grupos) lineas.push({ peso: g.ok + g.no, texto: `${clave}: guardaste ${g.ok}, descartaste ${g.no}.` });

  const campos = new Map<string, { tabla: string; campo: string; n: number }>();
  for (const c of e.correcciones) {
    for (const campo of c.campos) {
      const clave = `${c.tabla}.${campo}`;
      const v = campos.get(clave) ?? { tabla: c.tabla, campo, n: 0 };
      v.n += 1;
      campos.set(clave, v);
    }
  }
  for (const v of campos.values()) {
    lineas.push({ peso: v.n, texto: `Corregiste «${etiquetaCampo(v.tabla, v.campo)}» (${etiquetaTabla(v.tabla)}) ${veces(v.n)} antes de guardar.` });
  }

  const seguir = e.entendimiento.filter((x) => x.resultado === "seguir").length;
  const otra = e.entendimiento.filter((x) => x.resultado === "alternativa" || x.resultado === "otra").length;
  if (seguir + otra > 0) lineas.push({ peso: seguir + otra, texto: `Confirmaste que te entendí ${veces(seguir)}; elegiste otra opción ${veces(otra)}.` });

  const malos = new Map<string, number>();
  for (const x of e.entendimiento) {
    if (x.resultado !== "malentendido") continue;
    const clave = x.tabla && x.operacion ? `${VERBO[x.operacion] ?? x.operacion} · ${etiquetaTabla(x.tabla)}` : "sin detalle";
    malos.set(clave, (malos.get(clave) ?? 0) + 1);
  }
  for (const [clave, n] of malos) lineas.push({ peso: n, texto: `Me dijiste «No es esto» ${veces(n)} (${clave}).` });

  // Orden estable: por volumen, y a igual volumen en el orden en que se armaron.
  return lineas
    .map((l, i) => ({ ...l, i }))
    .sort((a, b) => b.peso - a.peso || a.i - b.i)
    .slice(0, MAX_LINEAS_RESULTADOS)
    .map((l) => l.texto);
}
