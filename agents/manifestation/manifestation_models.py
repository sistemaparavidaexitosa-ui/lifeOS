"""Los datos, y solo los datos.

Este módulo no hace red, no lee ficheros y no importa nada del resto del
paquete. Es la forma que tiene el agente de no confundir «lo que me dieron» con
«lo que decidí»: todo lo que cruza una frontera —el contexto que llega de
LifeOS, el payload que se devuelve— pasa por un modelo de aquí.

`extra="forbid"` en todos: una clave que LifeOS empiece a mandar y que aquí no
esté declarada tiene que romper un test, no ignorarse en silencio durante tres
semanas hasta que alguien note que el agente no usa la mitad del contexto.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Mapping

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Base(BaseModel):
    """Inmutable y estricto. Un modelo que se puede mutar es un estado oculto."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class Tone(StrEnum):
    SERENO = "sereno"
    DIRECTO = "directo"
    INTENSO = "intenso"


class Principle(StrEnum):
    HILL = "hill"
    GODDARD = "goddard"
    CLEAR = "clear"
    SHARMA = "sharma"
    DISPENZA = "dispenza"


class Area(StrEnum):
    """Las siete áreas de vida de 0064. Son estructurales: no se amplían aquí."""

    SALUD = "Salud"
    CARRERA = "Carrera"
    RELACIONES = "Relaciones"
    FINANZAS = "Finanzas"
    APRENDIZAJE = "Aprendizaje"
    ESPIRITUAL = "Espiritual"
    PERSONAL = "Personal"


class Category(StrEnum):
    """Las once categorías de afirmación. Son de presentación, no de estructura."""

    CARRERA = "Carrera"
    NEGOCIO = "Negocio"
    DINERO = "Dinero"
    LIDERAZGO = "Liderazgo"
    RELACIONES = "Relaciones"
    SALUD = "Salud"
    DISCIPLINA = "Disciplina"
    CONFIANZA = "Confianza"
    APRENDIZAJE = "Aprendizaje"
    PROPOSITO = "Propósito"
    ESPIRITUALIDAD = "Espiritualidad"


#: A qué área proyecta cada categoría. Espejo EXACTO de
#: `src/lib/domain/identity/categorias.ts`. Si los dos se separan, la pantalla
#: agrupará por una cosa y el Identity Score medirá otra; hay un test que
#: comprueba que el mapeo es total, pero la fuente de verdad es el lado de
#: TypeScript, que es quien guarda.
CATEGORY_AREA: Mapping[Category, Area] = {
    Category.CARRERA: Area.CARRERA,
    Category.NEGOCIO: Area.CARRERA,
    Category.LIDERAZGO: Area.CARRERA,
    Category.DINERO: Area.FINANZAS,
    Category.RELACIONES: Area.RELACIONES,
    Category.SALUD: Area.SALUD,
    Category.DISCIPLINA: Area.PERSONAL,
    Category.CONFIANZA: Area.PERSONAL,
    Category.APRENDIZAJE: Area.APRENDIZAJE,
    Category.PROPOSITO: Area.ESPIRITUAL,
    Category.ESPIRITUALIDAD: Area.ESPIRITUAL,
}


# ---------------------------------------------------------------------------
# LO QUE LLEGA DE LIFEOS
# ---------------------------------------------------------------------------


class TraitRef(Base):
    id: str
    name: str
    statement: str = ""
    area: str = ""
    completion30: int | None = None


class FactRef(Base):
    id: str
    label: str


class GoalRef(Base):
    title: str
    area: str = ""
    progressPct: int = 0


class RoutineRef(Base):
    name: str
    identity: str = ""


class ReflectionRef(Base):
    date: str
    text: str


class PreviousBrief(Base):
    date: str
    affirmations: list[str] = Field(default_factory=list)
    resonated: list[str] = Field(default_factory=list)
    notResonated: list[str] = Field(default_factory=list)
    mantra: str | None = None


class StylePreference(Base):
    """Una preferencia aprendida, SIEMPRE con su evidencia.

    `lift`, `n` y `nSin` no son decoración: son lo que permite que el prompt
    presente esto como una observación y no como una orden. Una preferencia sin
    su n es indistinguible de una invención.
    """

    etiqueta: str
    valor: str
    lift: int
    n: int
    nSin: int
    confianza: str


class StylePreferences(Base):
    n: int = 0
    enough: bool = False
    note: str = ""
    preferences: list[StylePreference] = Field(default_factory=list)


class Identity(Base):
    desired: str
    vision: str = ""
    values: list[str] = Field(default_factory=list)
    previous: str | None = None
    tone: Tone = Tone.DIRECTO
    inspirations: list[Principle] = Field(default_factory=list)


class Limits(Base):
    minAffirmations: int = 10
    maxAffirmations: int = 20
    maxSteps: int = 12
    visualizationSeconds: dict[str, int] = Field(default_factory=lambda: {"min": 240, "max": 420})
    mantraMaxWords: int = 20


class Vocabulary(Base):
    categorias: list[str] = Field(default_factory=list)
    areas: list[str] = Field(default_factory=list)
    principios: list[str] = Field(default_factory=list)


class LifeOSContext(Base):
    """Todo lo que LifeOS sabe y el agente necesita, en un solo objeto.

    `contextVersion` es lo que impide que un despliegue desfasado escriba
    tonterías: si LifeOS cambia la forma y este servicio no se ha redesplegado,
    el agente falla en voz alta (502) y el lado TypeScript cae a su respaldo. La
    alternativa —aceptar cualquier forma y usar lo que se reconozca— produciría
    briefs silenciosamente peores durante días.
    """

    ok: bool = True
    contextVersion: int
    token: str
    today: str
    timeZone: str = "UTC"
    identity: Identity
    traits: list[TraitRef] = Field(default_factory=list)
    goals: list[GoalRef] = Field(default_factory=list)
    routines: list[RoutineRef] = Field(default_factory=list)
    facts: list[FactRef] = Field(default_factory=list)
    memory: list[str] = Field(default_factory=list)
    reflections: list[ReflectionRef] = Field(default_factory=list)
    previousBriefs: list[PreviousBrief] = Field(default_factory=list)
    stylePreferences: StylePreferences = Field(default_factory=StylePreferences)
    identityScore: int | None = None
    limits: Limits = Field(default_factory=Limits)
    vocabulary: Vocabulary = Field(default_factory=Vocabulary)


# ---------------------------------------------------------------------------
# LO QUE SE DEVUELVE — claves en español, porque es el contrato con `BriefCrudo`
# ---------------------------------------------------------------------------


class AfirmacionOut(Base):
    texto: str
    rasgoId: str = ""
    categoria: str | None = None


class PasoOut(Base):
    texto: str
    segundos: int = Field(ge=1, le=600)


class VisualizacionOut(Base):
    titulo: str
    pasos: list[PasoOut]


class CitaOut(Base):
    texto: str
    principio: Principle


class AccionOut(Base):
    texto: str
    rasgoId: str = ""
    area: Area | None = None


class BriefPayload(Base):
    """Exactamente lo que acepta `ManifestationPayloadSchema` en TypeScript."""

    afirmaciones: list[AfirmacionOut]
    visualizacion: VisualizacionOut
    recordatorio: str
    pregunta: str
    cita: CitaOut
    mantra: str | None = None
    accionDelDia: AccionOut | None = None
    focusArea: str | None = None
    factIds: list[str] = Field(default_factory=list)

    @field_validator("mantra")
    @classmethod
    def _mantra_de_una_pieza(cls, v: str | None) -> str | None:
        """Veinte palabras, una frase.

        Se valida aquí Y en TypeScript a propósito. Esta copia no protege nada
        —la autoridad es `sanearMantra`—: ahorra un viaje de ida y vuelta,
        porque un mantra largo detectado aquí se puede reescribir antes de
        mandarlo, y detectado allí cuesta un 422 y un reintento.
        """
        if v is None:
            return None
        limpio = " ".join(v.split())
        if not limpio:
            return None
        if len(limpio.split()) > 20:
            raise ValueError("el mantra pasa de 20 palabras")
        return limpio


class AgentResponse(Base):
    """El sobre que viaja de vuelta a la Server Action."""

    ok: bool = True
    model: str
    agentVersion: str
    promptVersion: int
    payload: BriefPayload


class ManifestationBrief(Base):
    """La API pública del agente: `generate_daily_manifestation(user_id)`.

    Es una vista de `BriefPayload` con nombres en inglés y sin los detalles del
    transporte. Existe separada porque es lo que verá cualquier consumidor
    futuro —una app de voz, un TTS, un recordatorio— y no tiene por qué heredar
    el vocabulario del contrato con la base de datos.
    """

    affirmations: list[AfirmacionOut]
    visualization: VisualizacionOut
    mantra: str | None
    daily_action: AccionOut | None
    focus_area: str | None
    generated_at: str

    @staticmethod
    def de_payload(payload: BriefPayload, ahora: datetime | None = None) -> "ManifestationBrief":
        momento = ahora or datetime.now(timezone.utc)
        return ManifestationBrief(
            affirmations=payload.afirmaciones,
            visualization=payload.visualizacion,
            mantra=payload.mantra,
            daily_action=payload.accionDelDia,
            focus_area=payload.focusArea,
            generated_at=momento.isoformat(),
        )
