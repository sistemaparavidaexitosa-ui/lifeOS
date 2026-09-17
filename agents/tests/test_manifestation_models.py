"""Los modelos, y la prueba de contrato con TypeScript."""

import json

import pytest
from pydantic import ValidationError

from manifestation.manifestation_models import (
    CATEGORY_AREA,
    AgentResponse,
    Area,
    BriefPayload,
    Category,
    ManifestationBrief,
)

from .factories import ejemplo_del_contrato


def test_el_ejemplo_del_contrato_valida_aqui_tambien():
    # Si esto se cae, TypeScript y Python han derivado. Es el punto entero de
    # que el fixture sea un archivo compartido y no dos copias.
    respuesta = AgentResponse.model_validate(ejemplo_del_contrato())
    assert respuesta.payload.mantra == "Hoy elijo la versión de mí que no negocia sus mañanas"
    assert len(respuesta.payload.afirmaciones) == 12
    assert len(respuesta.payload.visualizacion.pasos) == 9


def test_el_mapeo_de_categorias_a_areas_es_total():
    # El invariante que impide que la pantalla agrupe por una cosa y el
    # Identity Score mida otra.
    assert set(CATEGORY_AREA) == set(Category)
    for categoria, area in CATEGORY_AREA.items():
        assert isinstance(area, Area), categoria


def test_las_agrupaciones_que_no_son_obvias():
    assert CATEGORY_AREA[Category.NEGOCIO] is Area.CARRERA
    assert CATEGORY_AREA[Category.LIDERAZGO] is Area.CARRERA
    assert CATEGORY_AREA[Category.DISCIPLINA] is Area.PERSONAL
    assert CATEGORY_AREA[Category.PROPOSITO] is Area.ESPIRITUAL


def test_una_clave_de_mas_se_rechaza():
    datos = ejemplo_del_contrato()
    datos["payload"]["inventado"] = "algo"
    with pytest.raises(ValidationError):
        AgentResponse.model_validate(datos)


def test_el_mantra_de_veintiuna_palabras_no_pasa():
    datos = ejemplo_del_contrato()
    datos["payload"]["mantra"] = " ".join(f"palabra{i}" for i in range(21))
    with pytest.raises(ValidationError):
        AgentResponse.model_validate(datos)


def test_el_mantra_se_normaliza_pero_no_se_recorta():
    datos = ejemplo_del_contrato()
    datos["payload"]["mantra"] = "  Hoy   elijo    lo difícil  "
    assert AgentResponse.model_validate(datos).payload.mantra == "Hoy elijo lo difícil"


def test_los_segundos_imposibles_se_caen():
    datos = ejemplo_del_contrato()
    datos["payload"]["visualizacion"]["pasos"][0]["segundos"] = -5
    with pytest.raises(ValidationError):
        AgentResponse.model_validate(datos)


def test_un_principio_inventado_se_cae():
    datos = ejemplo_del_contrato()
    datos["payload"]["cita"]["principio"] = "tolle"
    with pytest.raises(ValidationError):
        AgentResponse.model_validate(datos)


def test_la_api_publica_tiene_la_forma_que_se_prometio():
    payload = BriefPayload.model_validate(ejemplo_del_contrato()["payload"])
    brief = ManifestationBrief.de_payload(payload)
    # Exactamente las claves del contrato pedido.
    assert set(brief.model_dump()) == {
        "affirmations",
        "visualization",
        "mantra",
        "daily_action",
        "focus_area",
        "generated_at",
    }
    assert brief.generated_at.endswith("+00:00")


def test_los_modelos_son_inmutables():
    payload = BriefPayload.model_validate(ejemplo_del_contrato()["payload"])
    with pytest.raises(ValidationError):
        payload.recordatorio = "otra cosa"
