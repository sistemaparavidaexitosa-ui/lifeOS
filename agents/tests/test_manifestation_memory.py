"""La frontera con LifeOS, y el invariante de la topología."""

import ast
from pathlib import Path

import httpx
import pytest

from manifestation.config import Settings
from manifestation.errors import ContextUnavailable, ProfileIncomplete
from manifestation.manifestation_memory import DailyMemory, HttpLifeOSClient
from manifestation.manifestation_models import PreviousBrief, StylePreferences

from .factories import contexto, preferencia

PAQUETE = Path(__file__).resolve().parents[1] / "manifestation"

PROHIBIDOS = {"supabase", "psycopg", "psycopg2", "asyncpg", "sqlalchemy", "postgrest"}


def test_el_agente_no_importa_ningun_cliente_de_base_de_datos():
    """El invariante de D-164, probado como tal.

    «Python no toca Supabase» es una frase en un documento hasta que un test la
    sostiene. Lo que protege no es el estilo: es que la RLS y la lista blanca de
    tablas legibles por IA sigan siendo el único camino a los datos.
    """
    culpables = []
    for archivo in PAQUETE.glob("*.py"):
        arbol = ast.parse(archivo.read_text(encoding="utf-8"))
        for nodo in ast.walk(arbol):
            nombres = []
            if isinstance(nodo, ast.Import):
                nombres = [a.name for a in nodo.names]
            elif isinstance(nodo, ast.ImportFrom) and nodo.module:
                nombres = [nodo.module]
            for n in nombres:
                if n.split(".")[0].lower() in PROHIBIDOS:
                    culpables.append(f"{archivo.name}: {n}")
    assert culpables == [], f"el agente no puede hablar con la base: {culpables}"


def ajustes(**extra) -> Settings:
    base = {"lifeos_base_url": "https://lifeos.test", "lifeos_agent_secret": "s3cr3to", "lifeos_timeout_s": 1.0}
    base.update(extra)
    return Settings(**base)


async def test_un_409_es_de_la_persona_y_no_del_agente():
    transporte = httpx.MockTransport(
        lambda _: httpx.Response(409, json={"reason": "Primero di en quién te estás convirtiendo."})
    )
    async with httpx.AsyncClient(transport=transporte) as c:
        cliente = HttpLifeOSClient(ajustes(), c)
        with pytest.raises(ProfileIncomplete) as e:
            await cliente.fetch_context("u1")
    # El mensaje llega en español y se propaga tal cual a la persona.
    assert "convirtiendo" in e.value.mensaje


async def test_una_version_de_contexto_desconocida_falla_en_voz_alta():
    datos = contexto().model_dump(mode="json")
    datos["contextVersion"] = 99
    transporte = httpx.MockTransport(lambda _: httpx.Response(200, json=datos))
    async with httpx.AsyncClient(transport=transporte) as c:
        with pytest.raises(ContextUnavailable) as e:
            await HttpLifeOSClient(ajustes(), c).fetch_context("u1")
    assert "versión de contexto 99" in e.value.mensaje


async def test_se_reintenta_en_5xx_pero_nunca_en_4xx():
    intentos = {"n": 0}

    def responder(request: httpx.Request) -> httpx.Response:
        intentos["n"] += 1
        return httpx.Response(500, json={})

    async with httpx.AsyncClient(transport=httpx.MockTransport(responder)) as c:
        with pytest.raises(ContextUnavailable):
            await HttpLifeOSClient(ajustes(), c).fetch_context("u1")
    assert intentos["n"] == 3, "tres intentos en 5xx"

    intentos["n"] = 0

    def responder400(request: httpx.Request) -> httpx.Response:
        intentos["n"] += 1
        return httpx.Response(400, json={"reason": "mal formada"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(responder400)) as c:
        with pytest.raises(ContextUnavailable):
            await HttpLifeOSClient(ajustes(), c).fetch_context("u1")
    # Un 400 es culpa nuestra: reintentar lo mismo solo gasta el tiempo que el
    # respaldo de LifeOS necesita.
    assert intentos["n"] == 1


async def test_el_secreto_viaja_en_la_cabecera_y_el_user_id_en_el_cuerpo():
    visto = {}

    def responder(request: httpx.Request) -> httpx.Response:
        visto["secreto"] = request.headers.get("x-agent-secret")
        visto["url"] = str(request.url)
        visto["cuerpo"] = request.content.decode()
        return httpx.Response(200, json=contexto().model_dump(mode="json"))

    async with httpx.AsyncClient(transport=httpx.MockTransport(responder)) as c:
        await HttpLifeOSClient(ajustes(), c).fetch_context("u-123")

    assert visto["secreto"] == "s3cr3to"
    # El id NO puede ir en la URL: las URL acaban en registros de acceso.
    assert "u-123" not in visto["url"]
    assert "u-123" in visto["cuerpo"]


# --- LA MEMORIA ES DE SOLO LECTURA -----------------------------------------


def test_daily_memory_ordena_lo_que_ya_vino_sin_guardar_nada():
    c = contexto(
        previous=[
            PreviousBrief(date="2026-09-16", affirmations=["A", "B"], resonated=["A"], notResonated=["B"], mantra="M1"),
            PreviousBrief(date="2026-09-15", affirmations=["C"], resonated=[], notResonated=[]),
        ]
    )
    m = DailyMemory(c)
    assert m.afirmaciones_previas == ["A", "B", "C"]
    assert m.resonaron == ["A"]
    assert m.no_resonaron == ["B"]
    assert m.mantras_previos == ["M1"]


def test_las_preferencias_se_cortan_en_tres():
    c = contexto(
        style=StylePreferences(
            n=30,
            enough=True,
            preferences=[preferencia(valor=f"v{i}", confianza="alta") for i in range(5)],
        )
    )
    assert len(DailyMemory(c).preferencias_utiles) == 3
