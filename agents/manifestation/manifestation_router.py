"""La cara HTTP del agente.

Está separada de `manifestation_agent` a propósito y no por ceremonia: el
agente es una clase con un método asíncrono y ninguna noción de HTTP, así que
mañana puede invocarlo una cola, un cron, o un `POST /manifestation/audio` que
reutilice el mismo brief para generar voz. Si la orquestación viviera dentro de
la ruta, cada consumidor nuevo tendría que hablar HTTP consigo mismo.

EL MAPEO DE ERRORES ES PARTE DEL CONTRATO, no un detalle. El lado TypeScript
decide con el código de estado si cae a su respaldo:
  409 → NO cae (el respaldo fallaría igual: falta identidad declarada).
  502/503 → cae, y rápido.
  422 → cae (lo que salió no se sostiene).
"""

from __future__ import annotations

import hmac
import logging
import uuid

from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import __version__
from .config import Settings, get_settings
from .errors import AgentError
from .gemini import GeminiProvider
from .manifestation_agent import ManifestationArchitect
from .manifestation_memory import HttpLifeOSClient

log = logging.getLogger("manifestation")

app = FastAPI(title="Manifestation Architect", version=__version__)


class DailyRequest(BaseModel):
    model_config = {"extra": "ignore"}

    userId: str
    localDate: str | None = None
    timeZone: str | None = None
    #: El token que emitió LifeOS. Viaja de vuelta con el brief.
    token: str | None = None


class _NoAutorizado(Exception):
    pass


def _autorizar(recibido: str | None, settings: Settings) -> None:
    """Compara en tiempo constante, igual que el lado TypeScript.

    Sin secreto configurado NO se deja pasar. Es la diferencia con
    `MANIFESTATION_AGENT_URL` en LifeOS, donde «no configurado» significa
    razonablemente «no hay agente»: aquí significaría «cualquiera puede pedirme
    el brief de cualquier persona».
    """
    if not settings.agent_inbound_secret:
        raise _NoAutorizado("El agente no tiene secreto de entrada configurado.")
    if not recibido or not hmac.compare_digest(recibido, settings.agent_inbound_secret):
        raise _NoAutorizado("No autorizado")


def _arquitecto(settings: Settings) -> ManifestationArchitect:
    return ManifestationArchitect(
        client=HttpLifeOSClient(settings),
        provider=GeminiProvider(settings),
        settings=settings,
    )


@app.get("/health")
async def health() -> dict:
    """Sin secreto: es lo que mira el orquestador para saber si el contenedor vive."""
    return {"ok": True, "version": __version__}


@app.post("/manifestation/daily")
async def daily(peticion: DailyRequest, request: Request, x_agent_secret: str | None = Header(default=None)) -> JSONResponse:
    settings = get_settings()
    try:
        _autorizar(x_agent_secret, settings)
    except _NoAutorizado as e:
        return JSONResponse({"ok": False, "reason": str(e)}, status_code=401)

    correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())

    try:
        respuesta = await _arquitecto(settings).produce(peticion.userId, peticion.localDate)
    except AgentError as e:
        log.warning("brief fallido (%s): %s", correlation_id, e.mensaje)
        return JSONResponse(
            {"ok": False, "reason": e.mensaje, "problemas": e.detalles, "correlationId": correlation_id},
            status_code=e.status,
        )
    except Exception:  # noqa: BLE001 — el 500 es el último recurso y no debe filtrar nada
        # Se registra con traza, pero hacia fuera solo va el identificador: el
        # payload lleva la vida interior de una persona y no puede acabar en un
        # cuerpo de error que quién sabe dónde se guarda.
        log.exception("fallo inesperado (%s)", correlation_id)
        return JSONResponse({"ok": False, "reason": "Error interno del agente.", "correlationId": correlation_id}, status_code=500)

    return JSONResponse(respuesta.model_dump(exclude_none=True))
