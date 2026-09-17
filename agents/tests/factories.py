"""Contextos de prueba, construidos a mano y sin red."""

from __future__ import annotations

import json
from pathlib import Path

from manifestation.manifestation_models import (
    FactRef,
    GoalRef,
    Identity,
    LifeOSContext,
    Limits,
    Principle,
    ReflectionRef,
    RoutineRef,
    StylePreference,
    StylePreferences,
    Tone,
    TraitRef,
    Vocabulary,
)

CONTRATO = Path(__file__).resolve().parents[1] / "contract" / "brief.example.json"


def ejemplo_del_contrato() -> dict:
    """El MISMO archivo que valida el test de TypeScript.

    Es la prueba de contrato más barata que existe: si el esquema de zod y estos
    modelos derivan, uno de los dos lados se pone en rojo.
    """
    return json.loads(CONTRATO.read_text(encoding="utf-8"))


def vocabulario() -> Vocabulary:
    return Vocabulary(
        categorias=["Carrera", "Negocio", "Dinero", "Liderazgo", "Relaciones", "Salud", "Disciplina", "Confianza", "Aprendizaje", "Propósito", "Espiritualidad"],
        areas=["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"],
        principios=["hill", "goddard", "clear", "sharma", "dispenza"],
    )


def contexto(
    *,
    desired: str = "Alguien libre financieramente y que no negocia sus mañanas",
    traits: list[TraitRef] | None = None,
    goals: list[GoalRef] | None = None,
    facts: list[FactRef] | None = None,
    style: StylePreferences | None = None,
    previous: list | None = None,
) -> LifeOSContext:
    return LifeOSContext(
        contextVersion=1,
        token="t.t",
        today="2026-09-17",
        timeZone="America/Mexico_City",
        identity=Identity(
            desired=desired,
            vision="Vivir de lo que construyo, con tiempo para los míos.",
            values=["Constancia", "Honestidad"],
            tone=Tone.DIRECTO,
            inspirations=[Principle.CLEAR, Principle.DISPENZA],
        ),
        traits=traits
        if traits is not None
        else [
            TraitRef(id="t1", name="Disciplinado", statement="Soy alguien que no negocia sus mañanas", area="Personal", completion30=42),
            TraitRef(id="t2", name="Libre financieramente", statement="Mi dinero trabaja", area="Finanzas", completion30=78),
            TraitRef(id="t3", name="Presente", statement="Estoy donde estoy", area="Relaciones", completion30=None),
        ],
        goals=goals if goals is not None else [GoalRef(title="Cerrar el trimestre por encima del plan", area="Finanzas", progressPct=60)],
        routines=[RoutineRef(name="Mañana", identity="Soy alguien que empieza antes que el ruido")],
        facts=facts
        if facts is not None
        else [
            FactRef(id="habits.streak.h1", label="Llevas 12 días seguidos entrenando"),
            FactRef(id="growth.goal.g1", label="Tu meta de ingresos va al 60 %"),
            FactRef(id="habits.weak.h2", label="Lees solo 2 de cada 7 días"),
        ],
        memory=["No me hables de madrugar, trabajo de noche"],
        reflections=[ReflectionRef(date="2026-09-16", text="Día flojo, dormí mal")],
        previousBriefs=previous or [],
        stylePreferences=style or StylePreferences(),
        identityScore=61,
        limits=Limits(),
        vocabulary=vocabulario(),
    )


def preferencia(etiqueta="tono", valor="intenso", lift=11, n=14, nSin=9, confianza="media") -> StylePreference:
    return StylePreference(etiqueta=etiqueta, valor=valor, lift=lift, n=n, nSin=nSin, confianza=confianza)


def respuesta_del_modelo(**extra) -> dict:
    """Lo que devolvería Gemini, ya parseado."""
    base = ejemplo_del_contrato()["payload"]
    base = json.loads(json.dumps(base))  # copia profunda
    base.update(extra)
    return base
