"""Las afirmaciones: se planifican antes y se filtran después.

DOS MOMENTOS, Y EL PRIMERO ES EL QUE MÁS IMPORTA.

*Antes* de llamar al modelo se decide CUÁNTAS y DE QUÉ. Pedir «entre diez y
veinte afirmaciones» a secas produce veinte variaciones de lo mismo: el modelo
escribe sobre lo que tiene más a mano, que suele ser disciplina y dinero. El
reparto por categorías, derivado de los rasgos y metas reales, es lo que hace
que aparezcan relaciones y salud cuando esa persona tiene algo ahí.

Y con un perfil pobre se piden DIEZ, no veinte. Inventar veinte afirmaciones
personales sobre alguien de quien se saben cuatro cosas es exactamente la
fábrica de frases de taza que todo el sistema intenta evitar.

*Después* se deduplica y se filtra. Es un espejo del saneado de TypeScript
—mismo Jaccard, mismo umbral 0.6— y NO protege nada: la autoridad es
`sanearBrief`, que vuelve a pasarlo todo al guardar. Lo que ahorra es un viaje:
una repetición detectada aquí se reescribe en el reintento interno; detectada
allí cuesta un 422 y una llamada entera.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass

from .manifestation_models import Area, Category
from .profile_builder import ManifestationProfile

UMBRAL_REPETIDA = 0.6

#: Ninguna categoría puede llevarse más de esto. Sin el tope, un perfil con
#: cuatro rasgos de disciplina produce un brief entero sobre disciplina.
MAX_PROPORCION_CATEGORIA = 0.4

_VACIAS = set(
    "de la que el en y a los las se del un una unos unas por con no su sus para es al lo como mas pero le ya me mi mis"
    " tu tus te hoy yo son ser esta este esto estos estas eso esa ese muy sin sobre entre cada".split()
)

_AUTORES = re.compile(
    r"\b(napoleon\s+hill|hill|neville|goddard|james\s+clear|robin\s+sharma|sharma|joe\s+dispenza|dispenza)\b",
    re.IGNORECASE,
)
_ATRIBUCION_FINAL = re.compile(r"[—–―-]\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s*\.?\s*$")

#: Qué categorías tienen sentido para cada área. Un rasgo de «Carrera» puede dar
#: pie a afirmaciones de carrera, de negocio o de liderazgo; uno de «Personal»,
#: a disciplina o confianza.
_CATEGORIAS_DE_AREA: dict[Area, list[Category]] = {
    Area.CARRERA: [Category.CARRERA, Category.NEGOCIO, Category.LIDERAZGO],
    Area.FINANZAS: [Category.DINERO],
    Area.SALUD: [Category.SALUD],
    Area.RELACIONES: [Category.RELACIONES],
    Area.APRENDIZAJE: [Category.APRENDIZAJE],
    Area.ESPIRITUAL: [Category.PROPOSITO, Category.ESPIRITUALIDAD],
    Area.PERSONAL: [Category.DISCIPLINA, Category.CONFIANZA],
}


def tokens_significativos(texto: str) -> set[str]:
    """Espejo exacto de `tokensSignificativos` en TypeScript."""
    plano = unicodedata.normalize("NFD", texto.lower())
    plano = "".join(c for c in plano if unicodedata.category(c) != "Mn")
    plano = re.sub(r"[^a-z0-9ñ\s]", " ", plano)
    return {t for t in plano.split() if len(t) >= 3 and t not in _VACIAS}


def similitud(a: str, b: str) -> float:
    A, B = tokens_significativos(a), tokens_significativos(b)
    if not A and not B:
        return 0.0
    comun = len(A & B)
    union = len(A) + len(B) - comun
    return comun / union if union else 0.0


def cita_atribuida(texto: str) -> bool:
    return bool(_AUTORES.search(unicodedata.normalize("NFKD", texto)) or _ATRIBUCION_FINAL.search(texto))


@dataclass(frozen=True)
class Slate:
    """El encargo: cuántas afirmaciones y repartidas cómo."""

    total: int
    reparto: dict[Category, int]

    def como_texto(self) -> str:
        lineas = [f"- {c.value}: {n}" for c, n in sorted(self.reparto.items(), key=lambda kv: (-kv[1], kv[0].value))]
        return "\n".join(lineas)


def plan(profile: ManifestationProfile) -> Slate:
    minimo = profile.limits.minAffirmations
    maximo = profile.limits.maxAffirmations

    # El volumen sale del material, no de la ambición. `material` cuenta rasgos,
    # metas y hechos citables; una afirmación por cada pieza y media es un
    # ritmo que se puede anclar sin inventar.
    if profile.es_perfil_pobre:
        total = minimo
    else:
        total = max(minimo, min(maximo, int(profile.material * 1.5)))

    # De qué va cada una: las categorías de las áreas donde esta persona tiene
    # rasgos o metas, en el orden en que el perfil las puso (peor cumplimiento
    # primero).
    candidatas: list[Category] = []
    for t in profile.traits:
        try:
            candidatas.extend(_CATEGORIAS_DE_AREA.get(Area(t.area), []))
        except ValueError:
            continue
    for g in profile.goals:
        try:
            candidatas.extend(_CATEGORIAS_DE_AREA.get(Area(g.area), []))
        except ValueError:
            continue

    if not candidatas:
        # Sin áreas conocidas: un reparto llano por las categorías más
        # universales, en vez de dejar que el modelo elija (elegiría dinero).
        candidatas = [Category.DISCIPLINA, Category.CONFIANZA, Category.SALUD, Category.PROPOSITO]

    # Se conserva el orden de aparición y se quitan duplicados: el orden es la
    # prioridad, y `set` la destruiría.
    orden: list[Category] = []
    for c in candidatas:
        if c not in orden:
            orden.append(c)

    tope = max(1, int(total * MAX_PROPORCION_CATEGORIA))
    reparto: Counter[Category] = Counter()
    i = 0
    while sum(reparto.values()) < total:
        categoria = orden[i % len(orden)]
        if reparto[categoria] < tope:
            reparto[categoria] += 1
        elif all(reparto[c] >= tope for c in orden):
            # Todas al tope y aún faltan: el tope cede antes que el total. Es
            # preferible un brief algo desequilibrado a uno con ocho
            # afirmaciones cuando se pidieron catorce.
            reparto[orden[i % len(orden)]] += 1
        i += 1
        if i > total * 20:  # cinturón: nunca girar para siempre
            break

    return Slate(total=sum(reparto.values()), reparto=dict(reparto))


@dataclass(frozen=True)
class Refinado:
    aceptadas: list[dict]
    descartadas: list[str]
    problemas: list[str]


def refine(
    afirmaciones: list[dict],
    *,
    previas: list[str],
    rasgos_validos: set[str],
    maximo: int,
) -> Refinado:
    """Quita repeticiones, atribuciones y rasgos inventados.

    El orden de los filtros no es indiferente: primero lo que descalifica la
    frase entera (vacía, atribuida), después la comparación contra el histórico.
    Así una frase que menciona a un autor no llega a ocupar un hueco que otra
    podría usar.
    """
    aceptadas: list[dict] = []
    descartadas: list[str] = []
    problemas: list[str] = []

    for a in afirmaciones:
        texto = " ".join(str(a.get("texto", "")).split())
        if not texto:
            continue

        if cita_atribuida(texto):
            descartadas.append(texto)
            problemas.append(f"«{texto}» nombra a un autor; las afirmaciones son originales y sin nombres.")
            continue

        repetida = any(similitud(texto, p) >= UMBRAL_REPETIDA for p in previas) or any(
            similitud(texto, x["texto"]) >= UMBRAL_REPETIDA for x in aceptadas
        )
        if repetida:
            descartadas.append(texto)
            continue

        rasgo = str(a.get("rasgoId") or "")
        aceptadas.append(
            {
                "texto": texto,
                "rasgoId": rasgo if rasgo in rasgos_validos else "",
                "categoria": a.get("categoria"),
            }
        )
        if len(aceptadas) >= maximo:
            break

    if descartadas:
        problemas.append(f"{len(descartadas)} afirmaciones se repetían con días anteriores o entre sí.")

    return Refinado(aceptadas=aceptadas, descartadas=descartadas, problemas=problemas)
