"""De lo que LifeOS mandó a un perfil con el que se pueda decidir.

Puro: entra un `LifeOSContext`, sale un `ManifestationProfile`. Ni red ni reloj.

Lo que aporta, y que no es solo renombrar campos:

  · **Ordena los rasgos por dónde duele.** El que peor cumplimiento tiene va
    primero, porque es del que hay algo que decir hoy.
  · **Cuenta el material disponible.** Es lo que después impide pedir veinte
    afirmaciones a alguien que acaba de registrarse y de quien no se sabe nada:
    veinte afirmaciones sin material son veinte frases de taza.
  · **Filtra lo aprendido.** Si LifeOS dice que no hay días suficientes, aquí no
    queda ninguna preferencia. La decisión de callar se toma una vez.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .manifestation_memory import DailyMemory
from .manifestation_models import (
    Area,
    GoalRef,
    Identity,
    LifeOSContext,
    Limits,
    Principle,
    RoutineRef,
    StylePreference,
    Tone,
    TraitRef,
)

#: Por debajo de esto, un perfil está vacío por mucho que tenga identidad
#: declarada. Cuenta rasgos + metas + hechos citables.
MATERIAL_MINIMO = 6

#: Todos los principios, cuando la persona no eligió ninguno.
PRINCIPIOS_POR_DEFECTO = [Principle.HILL, Principle.GODDARD, Principle.CLEAR, Principle.SHARMA]


@dataclass(frozen=True)
class ManifestationProfile:
    """Quién es esta persona, para el agente."""

    user_id: str
    today: str
    identity: Identity
    tone: Tone
    inspirations: list[Principle]
    traits: list[TraitRef]
    goals: list[GoalRef]
    routines: list[RoutineRef]
    facts: list[tuple[str, str]]
    memory_items: list[str] = field(default_factory=list)
    reflections: list[tuple[str, str]] = field(default_factory=list)
    style: list[StylePreference] = field(default_factory=list)
    identity_score: int | None = None
    limits: Limits = field(default_factory=Limits)

    @property
    def material(self) -> int:
        """Cuánto hay de esta persona sobre lo que escribir."""
        return len(self.traits) + len(self.goals) + len(self.facts)

    @property
    def es_perfil_pobre(self) -> bool:
        return self.material < MATERIAL_MINIMO

    @property
    def areas_con_rasgos(self) -> set[Area]:
        salida: set[Area] = set()
        for t in self.traits:
            try:
                salida.add(Area(t.area))
            except ValueError:
                # Un área que no está en el enum es una fila antigua o una
                # migración a medias. Se ignora en vez de reventar: perder un
                # rasgo del recuento es mejor que no escribir el brief.
                continue
        return salida


def build(contexto: LifeOSContext, user_id: str) -> ManifestationProfile:
    memoria = DailyMemory(contexto)

    # Sin cumplimiento se va al final: no es que vaya bien, es que no se sabe,
    # y un hábito sin datos no es de lo que hay que hablar hoy.
    rasgos = sorted(
        contexto.traits,
        key=lambda t: (t.completion30 is None, t.completion30 if t.completion30 is not None else 0),
    )

    return ManifestationProfile(
        user_id=user_id,
        today=contexto.today,
        identity=contexto.identity,
        tone=contexto.identity.tone,
        inspirations=list(contexto.identity.inspirations) or list(PRINCIPIOS_POR_DEFECTO),
        traits=rasgos,
        goals=list(contexto.goals),
        routines=list(contexto.routines),
        facts=[(f.id, f.label) for f in contexto.facts],
        memory_items=list(contexto.memory),
        reflections=[(r.date, r.text) for r in contexto.reflections],
        style=memoria.preferencias_utiles,
        identity_score=contexto.identityScore,
        limits=contexto.limits,
    )
