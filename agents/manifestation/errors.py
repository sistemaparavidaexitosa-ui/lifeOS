"""Los fallos del agente, tipados.

Cada uno se traduce a un código HTTP distinto en el router, y esa traducción
importa más de lo que parece: el lado TypeScript decide con ella si cae a su
respaldo o si propaga el mensaje a la persona.

  · `ProfileIncomplete` → 409. NO es motivo para el respaldo: el respaldo
    fallaría igual, porque el problema es que falta decir en quién se está
    convirtiendo uno. Su mensaje se le enseña a la persona tal cual.
  · `ContextUnavailable` → 502. LifeOS no contestó o habla otra versión.
  · `ModelUnavailable` → 503, y RÁPIDO. Que sea un 503 inmediato y no un
    timeout es la diferencia entre caer al respaldo en milisegundos o después
    de veinte segundos de espera que la persona sí nota.
  · `ValidationFailed` → 422. Lo que salió del modelo no se sostiene ni tras el
    reintento.
"""

from __future__ import annotations


class AgentError(Exception):
    """Base. Lleva un mensaje EN ESPAÑOL apto para enseñarse tal cual."""

    status = 500

    def __init__(self, mensaje: str, detalles: list[str] | None = None) -> None:
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.detalles = detalles or []


class ProfileIncomplete(AgentError):
    status = 409


class ContextUnavailable(AgentError):
    status = 502


class ModelUnavailable(AgentError):
    status = 503


class ValidationFailed(AgentError):
    status = 422
