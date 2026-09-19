"""La memoria del agente — que vive en Postgres, no aquí.

ESTE SERVICIO ES SIN ESTADO, Y ES DELIBERADO. La tentación con un módulo que se
llama «memoria» es guardar algo: un caché de contextos, un historial de briefs,
un fichero con lo aprendido. No se hace. Todo eso ya existe en LifeOS
(`identity_briefs`, `identity_brief_style`, `daily_reflections`), donde tiene
RLS, respaldo y una acción de «borrar mi historial de IA» que de verdad borra.
Un segundo almacén aquí sería un segundo origen de verdad que se desincroniza
el primer día y que sobrevive al borrado que la persona pidió.

Lo que sí hace este módulo es ser **el único que habla con LifeOS**. El resto
del paquete es lógica pura sobre objetos ya traídos. Eso permite probar el
agente entero sin levantar nada, y hace trivial comprobar el invariante de la
topología: aquí no se importa ningún cliente de base de datos, y hay un test
que lo verifica.
"""

from __future__ import annotations

import asyncio
from typing import Protocol

import httpx
from pydantic import ValidationError

from .config import Settings
from .errors import ContextUnavailable, ProfileIncomplete
from .manifestation_models import AgentResponse, LifeOSContext, StylePreference

#: La única versión de contexto que este agente sabe leer. Ver `LifeOSContext`.
CONTEXT_VERSION = 1


class LifeOSClient(Protocol):
    """La frontera, declarada como Protocol para poder inyectar un doble."""

    async def fetch_context(self, user_id: str, local_date: str | None = None) -> LifeOSContext: ...

    async def save_brief(self, respuesta: AgentResponse, *, user_id: str, local_date: str, token: str) -> str: ...


class HttpLifeOSClient:
    """El cliente de verdad.

    REINTENTA SOLO EN 5xx Y EN FALLOS DE RED, nunca en 4xx. Un 400 o un 422 son
    culpa nuestra —mandamos algo mal formado— y reintentar idéntico solo gasta
    el presupuesto de tiempo que el respaldo necesita. Un 409 tampoco se
    reintenta: es una condición de la persona, no un tropiezo.
    """

    def __init__(self, settings: Settings, cliente: httpx.AsyncClient | None = None) -> None:
        self._s = settings
        self._cliente = cliente
        self._base = settings.lifeos_base_url.rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {"content-type": "application/json", "x-agent-secret": self._s.lifeos_agent_secret}

    async def _post(self, ruta: str, cuerpo: dict, intentos: int = 3) -> httpx.Response:
        ultimo: Exception | None = None
        for intento in range(intentos):
            try:
                if self._cliente is not None:
                    respuesta = await self._cliente.post(f"{self._base}{ruta}", json=cuerpo, headers=self._headers())
                else:
                    async with httpx.AsyncClient(timeout=self._s.lifeos_timeout_s) as c:
                        respuesta = await c.post(f"{self._base}{ruta}", json=cuerpo, headers=self._headers())
            except (httpx.TimeoutException, httpx.TransportError) as e:
                ultimo = e
            else:
                if respuesta.status_code < 500:
                    return respuesta
                ultimo = httpx.HTTPStatusError("5xx", request=respuesta.request, response=respuesta)

            if intento < intentos - 1:
                # Espera creciente y corta: 0,2 s y 0,4 s. Más que eso y se come
                # el presupuesto que el respaldo de LifeOS necesita para actuar.
                await asyncio.sleep(0.2 * (2**intento))

        raise ContextUnavailable(f"LifeOS no respondió: {ultimo}")

    async def fetch_context(self, user_id: str, local_date: str | None = None) -> LifeOSContext:
        cuerpo: dict[str, object] = {"userId": user_id}
        if local_date:
            cuerpo["localDate"] = local_date

        respuesta = await self._post("/api/agents/manifestation/context", cuerpo)

        if respuesta.status_code == 409:
            # La persona todavía no dijo en quién se está convirtiendo, o tiene
            # la IA apagada para estos dominios. El mensaje viene en español y
            # se propaga tal cual: es para ella, no para el registro técnico.
            motivo = _motivo(respuesta, "Aún no has dicho en quién te estás convirtiendo.")
            raise ProfileIncomplete(motivo)

        if respuesta.status_code != 200:
            raise ContextUnavailable(_motivo(respuesta, f"LifeOS respondió {respuesta.status_code}."))

        try:
            contexto = LifeOSContext.model_validate(respuesta.json())
        except (ValidationError, ValueError) as e:
            raise ContextUnavailable(f"El contexto de LifeOS no tiene la forma esperada: {e}") from e

        if contexto.contextVersion != CONTEXT_VERSION:
            # Se falla EN VOZ ALTA en vez de aprovechar lo que se reconozca. Un
            # agente desfasado que sigue escribiendo produce briefs
            # silenciosamente peores durante días; uno que se cae hace que
            # LifeOS use su respaldo esa misma mañana y que alguien lo note.
            raise ContextUnavailable(
                f"LifeOS habla la versión de contexto {contexto.contextVersion} y este agente solo entiende la {CONTEXT_VERSION}."
            )

        return contexto

    async def save_brief(self, respuesta: AgentResponse, *, user_id: str, local_date: str, token: str) -> str:
        """Guardar por la puerta de atrás, para el camino asíncrono.

        En el camino del botón esto NO se usa: el brief vuelve en la respuesta
        HTTP y lo guarda la Server Action, que tiene la sesión de la persona.
        """
        r = await self._post(
            "/api/agents/manifestation/brief",
            {
                "token": token,
                "userId": user_id,
                "localDate": local_date,
                "model": respuesta.model,
                "agentVersion": respuesta.agentVersion,
                "payload": respuesta.payload.model_dump(exclude_none=True),
            },
        )
        if r.status_code != 200:
            raise ContextUnavailable(_motivo(r, f"LifeOS rechazó el brief ({r.status_code})."))
        return str(r.json().get("briefId", ""))


def _motivo(respuesta: httpx.Response, porDefecto: str) -> str:
    try:
        return str(respuesta.json().get("reason") or porDefecto)
    except ValueError:
        return porDefecto


class DailyMemory:
    """Vista de SOLO LECTURA sobre lo que el contexto ya trajo.

    No guarda nada; ordena. Existe para que el resto del agente pregunte «¿qué
    le resonó?» en vez de recorrer listas a mano, y para dejar escrito en un
    solo sitio qué se hace con las preferencias de confianza baja: descartarlas.
    """

    def __init__(self, contexto: LifeOSContext) -> None:
        self._c = contexto

    @property
    def afirmaciones_previas(self) -> list[str]:
        """Todo lo escrito en los últimos días, para no repetirse."""
        return [a for b in self._c.previousBriefs for a in b.affirmations]

    @property
    def mantras_previos(self) -> list[str]:
        return [b.mantra for b in self._c.previousBriefs if b.mantra]

    @property
    def resonaron(self) -> list[str]:
        return [a for b in self._c.previousBriefs for a in b.resonated]

    @property
    def no_resonaron(self) -> list[str]:
        return [a for b in self._c.previousBriefs for a in b.notResonated]

    @property
    def preferencias_utiles(self) -> list[StylePreference]:
        """Las que merecen entrar en el prompt.

        Dos filtros, y los dos importan. `enough` es el suelo de días que puso
        LifeOS: por debajo, la lista viene vacía y aquí no hay nada que decidir.
        El de confianza es por si algún día llegara alguna «baja»: una duda
        contada como conclusión es peor que el silencio, porque el modelo no
        sabe responder «no me fío».
        """
        if not self._c.stylePreferences.enough:
            return []
        return [p for p in self._c.stylePreferences.preferences if p.confianza != "baja"][:3]

    @property
    def nota_de_estilo(self) -> str:
        return self._c.stylePreferences.note
