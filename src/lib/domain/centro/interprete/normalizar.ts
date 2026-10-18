// src/lib/domain/centro/interprete/normalizar.ts
// El texto de la persona, en la forma en que el intérprete lo compara (D-205).
// Puro, probado en tests/domain/centro-interprete-valores.test.ts.
//
// Se compara SIN acentos y en minúsculas porque así escribe la gente en el
// móvil («manana», «cafe»): exigir la tilde sería exigir un teclado. Lo que
// se GUARDA no sale de aquí: el título se recupera del texto original
// (`tramoOriginal`), con sus mayúsculas y sus acentos.

/** Lo que sobrevive a la limpieza: letras, dígitos y lo que forma cifras, horas y fechas. */
const SIGNOS = /[^a-z0-9$.,:/\-\s]/g;

export function sinAcentos(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizar(t: string): string {
  return sinAcentos(t.toLowerCase()).replace(SIGNOS, " ").replace(/\s+/g, " ").trim();
}

/** El primer texto entre comillas («», "", “”), tal cual lo escribió. */
export function entreComillas(t: string): string | null {
  const m = /«([^»]+)»|"([^"]+)"|“([^”]+)”/.exec(t);
  const dentro = m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : "";
  return dentro || null;
}

/** `frase` como palabra completa: «nota» no está en «anotame». */
export function comoPalabra(frase: string): RegExp {
  const escapada = frase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(?<![a-z0-9])${escapada}(?![a-z0-9])`);
}

/**
 * El tramo del texto ORIGINAL que corresponde a `normalizado` (un trozo de
 * `normalizar(original)`), para guardar «Llamar a Juan» y no «llamar a juan».
 * Sin coincidencia, el normalizado: mejor un título en minúsculas que ninguno.
 */
export function tramoOriginal(original: string, normalizado: string): string {
  if (!normalizado) return "";
  // Se recorre el original carácter a carácter construyendo su versión
  // normalizada y recordando de qué posición del original salió cada letra.
  const posiciones: number[] = [];
  let plano = "";
  let enEspacio = true;
  for (let i = 0; i < original.length; i++) {
    const c = sinAcentos(original[i]!.toLowerCase()).replace(SIGNOS, " ");
    for (const ch of c) {
      if (/\s/.test(ch)) {
        if (enEspacio) continue;
        enEspacio = true;
        plano += " ";
      } else {
        enEspacio = false;
        plano += ch;
      }
      posiciones.push(i);
    }
  }
  const desde = plano.indexOf(normalizado);
  if (desde < 0) return normalizado;
  const inicio = posiciones[desde]!;
  const fin = posiciones[desde + normalizado.length - 1]!;
  return original.slice(inicio, fin + 1).trim();
}
