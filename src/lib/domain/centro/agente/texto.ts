// src/lib/domain/centro/agente/texto.ts
// El texto libre de un bloque no lleva cifras (D-194). Puro.
//
// El `texto` del turno puede citar cifras —el prompt le exige citar solo lo que
// leyó—, pero lo que va DENTRO de un bloque se lee como dato de la interfaz, y
// ahí una cifra escrita por el modelo se confunde con una calculada. Un conteo
// suelto («3 tareas») no es una cifra de dinero ni un porcentaje: pasa.

// El `\b` final solo sirve para los tokens de palabra (mxn, pesos…): después
// de `%` nunca hay transición palabra↔no-palabra —% y el espacio o fin de
// cadena que lo siguen son los dos «no palabra»—, así que `%` va en su propia
// alternativa, sin `\b`.
// El código de divisa también puede ir DELANTE («MXN 3,000», «USD 118»).
const CIFRA_CON_UNIDAD = /[$€£]\s*\d|\d[\d.,]*\s*%|\d[\d.,]*\s*(por ?ciento|mxn|usd|eur|pesos|d[oó]lares|euros)\b|\b(mxn|usd|eur)\s*\d/i;

export function tieneCifras(t: string): boolean {
  return CIFRA_CON_UNIDAD.test(t);
}
