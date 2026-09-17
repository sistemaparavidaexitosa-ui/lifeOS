"""¿En quién quiere convertirse esta persona?

Es la única pregunta de este módulo, y la contesta sin llamar a ningún modelo:
compone el bloque narrativo que después irá al prompt, y calcula de forma
determinista el área en la que el brief de hoy debería concentrarse.

POR QUÉ EL ÁREA DE FOCO SE CALCULA AQUÍ Y NO SE LE PIDE AL MODELO.
Se le pide igualmente —el modelo puede sobrescribirla—, pero se le entrega una
propuesta razonada. Un modelo al que se le pregunta «¿en qué área te centras
hoy?» sin más contesta casi siempre lo mismo: lo que suene más importante. El
criterio de aquí es otro y es comprobable: el área donde la persona tiene algo
vivo (un rasgo activo y una meta en marcha) y peor le está yendo. Ahí es donde
un empujón cambia algo.
"""

from __future__ import annotations

from dataclasses import dataclass

from .manifestation_models import Area
from .profile_builder import ManifestationProfile


@dataclass(frozen=True)
class IdentityNarrative:
    """El retrato con el que se escribe el brief."""

    current: str
    desired: str
    evolution: str | None
    values: list[str]
    vision: str
    #: Áreas con rasgo activo, ordenadas de peor a mejor cumplimiento.
    weak_areas: list[Area]
    focus_area: Area | None
    #: Los `factId` exactos que se pueden citar. Nada fuera de esta lista existe.
    citable_facts: list[str]


def compose(profile: ManifestationProfile) -> IdentityNarrative:
    cumplimiento_por_area: dict[Area, list[int]] = {}
    for t in profile.traits:
        if t.completion30 is None:
            continue
        try:
            area = Area(t.area)
        except ValueError:
            continue
        cumplimiento_por_area.setdefault(area, []).append(t.completion30)

    medias = {a: sum(v) / len(v) for a, v in cumplimiento_por_area.items() if v}
    debiles = sorted(medias, key=lambda a: medias[a])

    # Con meta viva pesa más: un área floja donde además hay algo en marcha es
    # donde el brief de hoy puede empujar de verdad. Un área floja y abandonada
    # solo produciría culpa.
    areas_con_meta = {g.area for g in profile.goals}
    con_meta = [a for a in debiles if a.value in areas_con_meta]

    foco: Area | None = None
    if con_meta:
        foco = con_meta[0]
    elif debiles:
        foco = debiles[0]
    elif profile.areas_con_rasgos:
        # Sin cumplimiento medido todavía: se elige de forma estable (por el
        # orden del enum) para que dos ejecuciones del mismo día no den áreas
        # distintas.
        foco = sorted(profile.areas_con_rasgos, key=lambda a: list(Area).index(a))[0]

    identidad_actual = _describir_presente(profile)

    return IdentityNarrative(
        current=identidad_actual,
        desired=profile.identity.desired,
        evolution=profile.identity.previous,
        values=list(profile.identity.values),
        vision=profile.identity.vision,
        weak_areas=debiles,
        focus_area=foco,
        citable_facts=[fid for fid, _ in profile.facts],
    )


def _describir_presente(profile: ManifestationProfile) -> str:
    """Quién es HOY, dicho con datos y no con adjetivos.

    Nada de «eres una persona disciplinada». Lo que hay son rasgos con un
    porcentaje al lado, y eso es lo que se le pasa al modelo: el retrato del
    presente tiene que poder contradecir al del futuro, o el brief se convierte
    en un espejo que solo dice que sí.
    """
    if not profile.traits:
        return "Todavía no ha definido rasgos: solo se sabe lo que declaró querer ser."

    piezas = []
    for t in profile.traits[:6]:
        if t.completion30 is None:
            piezas.append(f"{t.name} (sin hábitos vinculados)")
        else:
            piezas.append(f"{t.name} al {t.completion30} %")
    return "Sus rasgos, hoy: " + ", ".join(piezas) + "."
