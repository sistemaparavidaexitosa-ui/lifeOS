"""La visualización: nueve tiempos, cinco minutos, presente.

EL ARCO ES EL PRODUCTO. Una escena guiada que salta directa al logro no
funciona: el cuerpo no ha tenido tiempo de soltarse y la mente sigue en la lista
de pendientes. Por eso los nueve tiempos van en este orden y con estos
presupuestos, y por eso se valida que lleguen los nueve — con el tope de ocho
pasos que había antes, gratitud y regreso se perdían sin un solo aviso.

«YA ESTÁ OCURRIENDO», NO «IMAGINA QUE». Es la diferencia entre ensayar una
escena y pensar en ella, y es lo único de este módulo que se comprueba sobre el
texto: un paso que empieza por «imagina que» o «visualiza cómo» se rechaza, con
el motivo escrito, para que el reintento lo corrija.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

#: Los nueve tiempos, en orden, con lo que debería durar cada uno. Suman 300 s.
BEATS: tuple[tuple[str, str, int], ...] = (
    ("respiracion", "Respiración: tres respiraciones que sueltan los hombros.", 30),
    ("calma", "Calma: el ruido de alrededor se apaga.", 25),
    ("escena", "Escena: dónde está, qué día es, qué se ve.", 45),
    ("sensaciones", "Sensaciones: el peso, la temperatura, la textura de algo concreto.", 35),
    ("conversaciones", "Conversaciones: alguien le dice algo que solo se dice cuando ya ocurrió.", 40),
    ("resultados", "Resultados: la cifra, el hecho, lo que ya está hecho.", 40),
    ("emocion", "Emoción: cómo se siente ser esa persona, sin exagerar.", 35),
    ("gratitud", "Gratitud: por las veces en las que no le apetecía y fue igual.", 25),
    ("regreso", "Regreso: vuelve a la habitación con esa certeza puesta.", 25),
)

#: Aperturas que delatan que la escena se está describiendo en vez de viviendo.
_APERTURAS_PROHIBIDAS = (
    "imagina",
    "imaginate",
    "visualiza",
    "piensa en",
    "piensa que",
    "trata de ver",
    "intenta ver",
    "podrias",
    "vas a sentir",
    "sentiras",
    "estaras",
    "veras",
)

_SEGUNDOS_MIN_PASO = 10


def _plano(texto: str) -> str:
    sin = unicodedata.normalize("NFD", texto.strip().lower())
    return "".join(c for c in sin if unicodedata.category(c) != "Mn")


@dataclass(frozen=True)
class Validada:
    pasos: list[dict]
    problemas: list[str]

    @property
    def ok(self) -> bool:
        return bool(self.pasos) and not self.problemas


def guion() -> str:
    """El arco, tal y como se le describe al modelo."""
    return "\n".join(f"{i + 1}. {texto} (~{seg} s)" for i, (_, texto, seg) in enumerate(BEATS))


def validate(pasos: list[dict], *, min_segundos: int, max_segundos: int, max_pasos: int) -> Validada:
    """Comprueba el arco y reparte el reloj.

    El reparto proporcional copia lo que hace `ajustarPasos` en TypeScript, y
    por el mismo motivo: el orden y el peso relativo de cada tiempo los decidió
    el modelo —sabe cuál de sus propios pasos es el importante—, pero la
    duración total la pone el producto.
    """
    problemas: list[str] = []
    limpios: list[dict] = []

    for p in pasos[:max_pasos]:
        texto = " ".join(str(p.get("texto", "")).split())
        if not texto:
            continue
        plano = _plano(texto)
        if any(plano.startswith(a) for a in _APERTURAS_PROHIBIDAS):
            problemas.append(f"«{texto[:60]}…» describe la escena en vez de vivirla: escríbela como si ya estuviera pasando.")
            continue
        segundos = int(p.get("segundos") or 0)
        limpios.append({"texto": texto, "segundos": max(_SEGUNDOS_MIN_PASO, segundos)})

    if len(limpios) < len(BEATS):
        problemas.append(
            f"La visualización tiene {len(limpios)} pasos y el arco son {len(BEATS)}: "
            "respiración, calma, escena, sensaciones, conversaciones, resultados, emoción, gratitud y regreso."
        )
        return Validada(pasos=limpios, problemas=problemas)

    total = sum(p["segundos"] for p in limpios)
    objetivo = min(max_segundos, max(min_segundos, total))
    if objetivo != total and total > 0:
        escalados = [{**p, "segundos": max(1, (p["segundos"] * objetivo) // total)} for p in limpios]
        resto = objetivo - sum(p["segundos"] for p in escalados)
        escalados[-1]["segundos"] += resto
        limpios = escalados

    return Validada(pasos=limpios, problemas=problemas)


def presente_simple(texto: str) -> bool:
    """Heurística de apoyo: ¿esto suena a futuro?

    No se usa para rechazar —el español tiene demasiadas formas para eso— sino
    para que el prompt del reintento pueda señalar el problema cuando el modelo
    se va al futuro en la mayoría de los pasos.
    """
    return not re.search(r"\b\w+(ás|án|é|emos|eréis|erán|rá|rás)\b", texto)
