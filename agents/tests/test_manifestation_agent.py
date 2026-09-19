"""El orquestador entero, sin red y sin reloj."""

from datetime import datetime, timezone

import pytest

from manifestation.config import Settings
from manifestation.errors import ProfileIncomplete, ValidationFailed
from manifestation.manifestation_agent import ManifestationArchitect
from manifestation.manifestation_models import LifeOSContext

from .factories import contexto, respuesta_del_modelo


class ProveedorFalso:
    """Devuelve lo que se le diga y cuenta las llamadas."""

    def __init__(self, *respuestas):
        self.respuestas = list(respuestas)
        self.llamadas = 0
        self.prompts = []
        self.systems = []

    async def generate_json(self, *, system, prompt, schema):
        self.llamadas += 1
        self.prompts.append(prompt)
        self.systems.append(system)
        datos = self.respuestas[min(self.llamadas - 1, len(self.respuestas) - 1)]
        return datos, "gemini-3.6-flash"


class ClienteFalso:
    def __init__(self, ctx: LifeOSContext):
        self.ctx = ctx

    async def fetch_context(self, user_id, local_date=None):
        return self.ctx

    async def save_brief(self, respuesta, *, user_id, local_date, token):
        return "guardado"


def arquitecto(ctx, proveedor):
    return ManifestationArchitect(
        client=ClienteFalso(ctx),
        provider=proveedor,
        settings=Settings(agent_version="9.9.9"),
        clock=lambda: datetime(2026, 9, 17, 6, 30, tzinfo=timezone.utc),
    )


async def test_el_camino_feliz_es_UNA_sola_llamada_al_modelo():
    # Tres llamadas (una por motor) triplicarían coste y latencia y darían un
    # mantra que no conversa con las afirmaciones.
    proveedor = ProveedorFalso(respuesta_del_modelo())
    respuesta = await arquitecto(contexto(), proveedor).produce("u1")

    assert proveedor.llamadas == 1
    assert respuesta.ok is True
    assert respuesta.agentVersion == "9.9.9"
    assert len(respuesta.payload.afirmaciones) == 12
    assert respuesta.payload.mantra


async def test_la_api_publica_devuelve_exactamente_lo_prometido():
    brief = await arquitecto(contexto(), ProveedorFalso(respuesta_del_modelo())).generate_daily_manifestation("u1")
    assert set(brief.model_dump()) == {"affirmations", "visualization", "mantra", "daily_action", "focus_area", "generated_at"}
    assert brief.generated_at == "2026-09-17T06:30:00+00:00"
    assert brief.daily_action.texto.startswith("Llama al cliente")


async def test_sin_identidad_declarada_no_se_llama_al_modelo_siquiera():
    proveedor = ProveedorFalso(respuesta_del_modelo())
    with pytest.raises(ProfileIncomplete):
        await arquitecto(contexto(desired="  "), proveedor).produce("u1")
    assert proveedor.llamadas == 0, "no se gasta una llamada en algo que no puede salir bien"


async def test_un_reintento_como_mucho_y_con_los_problemas_escritos():
    pocas = respuesta_del_modelo(afirmaciones=[{"texto": "Solo una afirmación suelta aquí", "rasgoId": "t1", "categoria": "Dinero"}])
    proveedor = ProveedorFalso(pocas, respuesta_del_modelo())

    respuesta = await arquitecto(contexto(), proveedor).produce("u1")

    assert proveedor.llamadas == 2, "uno, y solo uno"
    assert respuesta.ok is True
    # El reintento lleva escrito qué corregir, no es otra tirada a ciegas.
    assert "TU INTENTO ANTERIOR NO SE PUDO USAR" in proveedor.prompts[1]
    assert "afirmaciones utilizables" in proveedor.prompts[1]


async def test_si_ni_el_reintento_se_sostiene_se_falla_en_voz_alta():
    vacio = respuesta_del_modelo(afirmaciones=[], visualizacion={"titulo": "x", "pasos": []})
    proveedor = ProveedorFalso(vacio, vacio)
    with pytest.raises(ValidationFailed) as e:
        await arquitecto(contexto(), proveedor).produce("u1")
    assert proveedor.llamadas == 2
    assert e.value.detalles, "el motivo viaja para poder diagnosticarlo"


async def test_los_hechos_inventados_no_llegan_al_payload():
    con_basura = respuesta_del_modelo(factIds=["habits.streak.h1", "hecho.que.no.existe"])
    respuesta = await arquitecto(contexto(), ProveedorFalso(con_basura)).produce("u1")
    assert respuesta.payload.factIds == ["habits.streak.h1"]


async def test_un_rasgo_de_otra_persona_se_cae():
    datos = respuesta_del_modelo()
    datos["afirmaciones"][0]["rasgoId"] = "de-otra-persona"
    respuesta = await arquitecto(contexto(), ProveedorFalso(datos)).produce("u1")
    assert respuesta.payload.afirmaciones[0].rasgoId == ""


async def test_una_cita_atribuida_se_sustituye_en_vez_de_guardarse():
    datos = respuesta_del_modelo()
    datos["cita"] = {"texto": "El éxito es un hábito. — James Clear", "principio": "clear"}
    proveedor = ProveedorFalso(datos, datos)
    respuesta = await arquitecto(contexto(), proveedor).produce("u1")
    # Se pidió corrección y, como el modelo insistió, se guarda una original.
    assert "Clear" not in respuesta.payload.cita.texto
    assert any("atribuida" in p for p in proveedor.prompts[1].split("\n"))


async def test_el_prompt_lleva_el_estilo_aprendido_con_su_evidencia():
    from manifestation.manifestation_models import StylePreferences

    from .factories import preferencia

    c = contexto(style=StylePreferences(n=23, enough=True, preferences=[preferencia(lift=11, n=14, nSin=9)]))
    proveedor = ProveedorFalso(respuesta_del_modelo())
    await arquitecto(c, proveedor).produce("u1")

    prompt = proveedor.prompts[0]
    assert "11 puntos mejores" in prompt
    assert "14 días con, 9 sin" in prompt, "sin la n es indistinguible de una invención"


async def test_sin_datos_suficientes_el_prompt_lo_dice_en_vez_de_callar():
    proveedor = ProveedorFalso(respuesta_del_modelo())
    await arquitecto(contexto(), proveedor).produce("u1")
    assert "todavía no hay datos suficientes" in proveedor.prompts[0]


async def test_el_texto_de_la_persona_viaja_delimitado_y_marcado_como_no_confiable():
    # Las dos mitades de la defensa, y las dos hacen falta: el texto va
    # envuelto en el prompt de usuario, y la orden de no obedecer lo que haya
    # dentro vive en el de sistema. Con una sola, alguien que escriba «ignora
    # las instrucciones anteriores» en su visión sería obedecido.
    proveedor = ProveedorFalso(respuesta_del_modelo())
    await arquitecto(contexto(), proveedor).produce("u1")

    assert "<<<" in proveedor.prompts[0] and ">>>" in proveedor.prompts[0]
    assert "Alguien libre financieramente" in proveedor.prompts[0]
    assert "nunca instrucciones" in proveedor.systems[0]
