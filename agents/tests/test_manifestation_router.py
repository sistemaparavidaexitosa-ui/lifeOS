"""La cara HTTP: el mapeo de errores es parte del contrato."""

import pytest
from fastapi.testclient import TestClient

from manifestation import manifestation_router as router
from manifestation.config import Settings
from manifestation.errors import ContextUnavailable, ModelUnavailable, ProfileIncomplete, ValidationFailed

from .factories import respuesta_del_modelo
from .test_manifestation_agent import ClienteFalso, ProveedorFalso
from .factories import contexto

SECRETO = "entrada-secreta"


@pytest.fixture(autouse=True)
def ajustes(monkeypatch):
    s = Settings(agent_inbound_secret=SECRETO, agent_version="1.0.0")
    monkeypatch.setattr(router, "get_settings", lambda: s)
    return s


@pytest.fixture
def cliente():
    return TestClient(router.app)


def con_agente(monkeypatch, *, lanza=None, respuestas=None):
    from manifestation.manifestation_agent import ManifestationArchitect

    class Falso(ManifestationArchitect):
        async def produce(self, user_id, local_date=None):
            if lanza is not None:
                raise lanza
            return await super().produce(user_id, local_date)

    def fabricar(settings):
        return Falso(
            client=ClienteFalso(contexto()),
            provider=ProveedorFalso(*(respuestas or [respuesta_del_modelo()])),
            settings=settings,
        )

    monkeypatch.setattr(router, "_arquitecto", fabricar)


def test_health_no_pide_secreto(cliente):
    r = cliente.get("/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_sin_secreto_es_401(cliente, monkeypatch):
    con_agente(monkeypatch)
    r = cliente.post("/manifestation/daily", json={"userId": "u1"})
    assert r.status_code == 401


def test_con_secreto_equivocado_es_401(cliente, monkeypatch):
    con_agente(monkeypatch)
    r = cliente.post("/manifestation/daily", json={"userId": "u1"}, headers={"x-agent-secret": "otro"})
    assert r.status_code == 401


def test_el_camino_feliz_devuelve_el_sobre_completo(cliente, monkeypatch):
    con_agente(monkeypatch)
    r = cliente.post("/manifestation/daily", json={"userId": "u1"}, headers={"x-agent-secret": SECRETO})
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["ok"] is True
    assert cuerpo["promptVersion"] >= 1
    assert len(cuerpo["payload"]["afirmaciones"]) == 12


@pytest.mark.parametrize(
    "error,esperado",
    [
        (ProfileIncomplete("Falta identidad"), 409),
        (ContextUnavailable("LifeOS no contesta"), 502),
        (ModelUnavailable("Sin cuota"), 503),
        (ValidationFailed("No se sostiene", ["algo"]), 422),
    ],
)
def test_cada_fallo_tiene_su_codigo_porque_lifeos_decide_con_el(cliente, monkeypatch, error, esperado):
    # 409 → LifeOS NO cae al respaldo (fallaría igual).
    # 502/503/422 → LifeOS cae al respaldo, y cuanto antes mejor.
    con_agente(monkeypatch, lanza=error)
    r = cliente.post("/manifestation/daily", json={"userId": "u1"}, headers={"x-agent-secret": SECRETO})
    assert r.status_code == esperado
    assert r.json()["reason"] == error.mensaje


def test_un_fallo_inesperado_no_filtra_nada_hacia_fuera(cliente, monkeypatch):
    con_agente(monkeypatch, lanza=RuntimeError("se rompió con el texto íntimo de alguien dentro"))
    r = cliente.post("/manifestation/daily", json={"userId": "u1"}, headers={"x-agent-secret": SECRETO})
    assert r.status_code == 500
    cuerpo = r.json()
    assert cuerpo["reason"] == "Error interno del agente."
    assert "íntimo" not in r.text
    assert cuerpo["correlationId"], "hay con qué encontrarlo en el registro"


def test_sin_secreto_de_entrada_configurado_no_se_deja_pasar_a_nadie(cliente, monkeypatch):
    monkeypatch.setattr(router, "get_settings", lambda: Settings(agent_inbound_secret=""))
    con_agente(monkeypatch)
    r = cliente.post("/manifestation/daily", json={"userId": "u1"}, headers={"x-agent-secret": ""})
    assert r.status_code == 401
