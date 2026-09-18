"""El único sitio del agente que habla con un modelo.

Mismo reparto que en LifeOS (`src/lib/ai/gemini-provider.ts`) y por los mismos
motivos: un solo punto de contacto, salida estructurada con `responseSchema`, y
NUNCA lanzar una excepción sin tipar hacia arriba. Aquí se traduce todo a
`ModelUnavailable`, que el router convierte en un 503 rápido — y un 503 rápido
es lo que permite que LifeOS caiga a su respaldo en milisegundos en lugar de
esperar a que venza el reloj.

EL PRESUPUESTO ES MAYOR QUE EL DE TYPESCRIPT, y no por generosidad. Allí se
piden cinco afirmaciones y dos minutos de escena con 4000 tokens; aquí se piden
hasta veinte, cinco minutos, mantra y acción. Con 4000 la respuesta se cortaría
a media llave y `finishReason` sería `MAX_TOKENS` con el texto vacío: no es un
error de red, no lo detecta nadie solo, y hay que comprobarlo a mano (se hace
más abajo).
"""

from __future__ import annotations

import json
from typing import Any, Protocol

import httpx

from .config import Settings
from .errors import ModelUnavailable

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"


class Provider(Protocol):
    async def generate_json(self, *, system: str, prompt: str, schema: dict) -> tuple[dict, str]: ...


class GeminiProvider:
    def __init__(self, settings: Settings, cliente: httpx.AsyncClient | None = None) -> None:
        self._s = settings
        self._cliente = cliente

    async def generate_json(self, *, system: str, prompt: str, schema: dict) -> tuple[dict, str]:
        """Devuelve `(datos, modelo)` o lanza `ModelUnavailable`."""
        if not self._s.gemini_api_key:
            raise ModelUnavailable("El agente no tiene configurada la llave del modelo.")

        cuerpo: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema,
                "maxOutputTokens": self._s.agent_max_output_tokens,
                "thinkingConfig": {"thinkingBudget": self._s.agent_thinking_budget},
            },
        }
        url = f"{ENDPOINT}/{self._s.gemini_model}:generateContent"
        headers = {"content-type": "application/json", "x-goog-api-key": self._s.gemini_api_key}

        try:
            if self._cliente is not None:
                respuesta = await self._cliente.post(url, json=cuerpo, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=self._s.agent_timeout_s) as c:
                    respuesta = await c.post(url, json=cuerpo, headers=headers)
        except httpx.TimeoutException as e:
            raise ModelUnavailable("El modelo tardó demasiado en responder.") from e
        except httpx.TransportError as e:
            raise ModelUnavailable("No se pudo contactar con el modelo.") from e

        if respuesta.status_code == 429:
            raise ModelUnavailable("Se agotó la cuota gratuita del modelo por ahora. Inténtalo de nuevo en un minuto.")
        if respuesta.status_code in (401, 403):
            raise ModelUnavailable("La llave del modelo no es válida o no tiene permiso.")
        if respuesta.status_code != 200:
            raise ModelUnavailable(_detalle(respuesta))

        try:
            datos = respuesta.json()
        except ValueError as e:
            raise ModelUnavailable("El modelo devolvió una respuesta ilegible.") from e

        if bloqueo := datos.get("promptFeedback", {}).get("blockReason"):
            raise ModelUnavailable(f"El modelo no quiso responder a esto ({bloqueo}).")

        candidato = (datos.get("candidates") or [{}])[0]
        fin = candidato.get("finishReason")
        # `MAX_TOKENS` con texto vacío es el fallo silencioso de arriba: hay que
        # nombrarlo, o se confunde con «el modelo no contestó».
        if fin and fin != "STOP":
            if fin == "MAX_TOKENS":
                raise ModelUnavailable("La respuesta salió demasiado larga y se cortó.")
            raise ModelUnavailable(f"El modelo no pudo terminar la respuesta ({fin}).")

        # Las partes se concatenan: una respuesta larga llega troceada y
        # quedarse con la primera daría un JSON cortado a media llave.
        texto = "".join(p.get("text", "") for p in candidato.get("content", {}).get("parts", [])).strip()
        if not texto:
            raise ModelUnavailable("El modelo devolvió una respuesta vacía.")

        try:
            return json.loads(texto), self._s.gemini_model
        except json.JSONDecodeError as e:
            raise ModelUnavailable("El modelo no devolvió JSON válido.") from e


def _detalle(respuesta: httpx.Response) -> str:
    try:
        mensaje = respuesta.json().get("error", {}).get("message")
    except ValueError:
        mensaje = None
    return f"El modelo rechazó la petición: {mensaje}" if mensaje else f"El modelo respondió con un error (HTTP {respuesta.status_code})."


def response_schema(categorias: list[str], areas: list[str], principios: list[str], max_afirmaciones: int, max_pasos: int) -> dict:
    """El `responseSchema` de Gemini.

    Los tipos van EN MAYÚSCULAS: el cuerpo se parsea como JSON de protobuf,
    donde un valor de enum se casa por su nombre exacto, y `"string"` en
    minúscula se rechaza con un 400 antes de llegar al modelo.

    `propertyOrdering` no es decorativo: sin él, el orden de las claves puede
    bailar entre llamadas idénticas.
    """
    return {
        "type": "OBJECT",
        "properties": {
            "afirmaciones": {
                "type": "ARRAY",
                "description": f"Entre 10 y {max_afirmaciones} afirmaciones en primera persona y presente, de 8 a 22 palabras.",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "texto": {"type": "STRING", "description": "La afirmación. Primera persona, presente, concreta, sin comillas."},
                        "rasgoId": {"type": "STRING", "description": "El id EXACTO del rasgo al que habla, o cadena vacía."},
                        "categoria": {"type": "STRING", "enum": categorias, "format": "enum"},
                    },
                    "required": ["texto", "rasgoId", "categoria"],
                    "propertyOrdering": ["texto", "rasgoId", "categoria"],
                },
            },
            "visualizacion": {
                "type": "OBJECT",
                "properties": {
                    "titulo": {"type": "STRING", "description": "Título breve de la escena."},
                    "pasos": {
                        "type": "ARRAY",
                        "description": f"Los 9 tiempos del arco, en orden. Máximo {max_pasos}.",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "texto": {"type": "STRING", "description": "Lo que está ocurriendo en ese tiempo. Segunda persona, presente."},
                                "segundos": {"type": "INTEGER", "description": "Entre 20 y 60."},
                            },
                            "required": ["texto", "segundos"],
                            "propertyOrdering": ["texto", "segundos"],
                        },
                    },
                },
                "required": ["titulo", "pasos"],
                "propertyOrdering": ["titulo", "pasos"],
            },
            "recordatorio": {"type": "STRING", "description": "Una o dos frases sobre quién está eligiendo ser hoy, con algo concreto suyo."},
            "pregunta": {"type": "STRING", "description": "Una sola pregunta abierta para esta noche."},
            "cita": {
                "type": "OBJECT",
                "properties": {
                    "texto": {"type": "STRING", "description": "Frase ORIGINAL tuya, sin comillas y sin nombrar a ningún autor."},
                    "principio": {"type": "STRING", "enum": principios, "format": "enum"},
                },
                "required": ["texto", "principio"],
                "propertyOrdering": ["texto", "principio"],
            },
            "mantra": {"type": "STRING", "description": "UNA frase, máximo 20 palabras."},
            "accionDelDia": {
                "type": "OBJECT",
                "properties": {
                    "texto": {"type": "STRING", "description": "Algo CONCRETO que se pueda terminar hoy."},
                    "rasgoId": {"type": "STRING", "description": "El id EXACTO del rasgo por el que vota, o cadena vacía."},
                    "area": {"type": "STRING", "enum": areas, "format": "enum"},
                },
                "required": ["texto", "rasgoId", "area"],
                "propertyOrdering": ["texto", "rasgoId", "area"],
            },
            "focusArea": {"type": "STRING", "enum": areas, "format": "enum"},
            "factIds": {"type": "ARRAY", "description": "Los id EXACTOS de los hechos que usaste.", "items": {"type": "STRING"}},
        },
        "required": ["afirmaciones", "visualizacion", "recordatorio", "pregunta", "cita", "mantra", "accionDelDia", "focusArea", "factIds"],
        "propertyOrdering": [
            "afirmaciones",
            "visualizacion",
            "recordatorio",
            "pregunta",
            "cita",
            "mantra",
            "accionDelDia",
            "focusArea",
            "factIds",
        ],
    }
