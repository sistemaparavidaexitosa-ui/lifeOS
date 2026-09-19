"""La configuración, en un solo sitio y validada al arrancar.

DOS SECRETOS DISTINTOS, Y NO ES REDUNDANCIA:

  · `agent_inbound_secret` es el que exige ESTE servicio a quien le llama
    (la Server Action de LifeOS).
  · `lifeos_agent_secret` es el que ESTE servicio presenta a LifeOS para pedir
    el contexto.

Pueden tener el mismo valor en una instalación pequeña, pero se declaran
separados porque protegen direcciones opuestas: rotar el de entrada no debería
obligar a rotar el de salida, y si algún día el agente sirve a más de un
LifeOS, el de entrada deja de ser uno solo.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    lifeos_base_url: str = Field(default="http://localhost:3000")
    lifeos_agent_secret: str = Field(default="")
    agent_inbound_secret: str = Field(default="")

    gemini_api_key: str = Field(default="")
    #: El mismo primer modelo de la cadena de `gemini-provider.ts`.
    gemini_model: str = Field(default="gemini-3.6-flash")

    #: Más alto que el `BRIEF_BUDGET` de TypeScript (4000) porque aquí se piden
    #: hasta veinte afirmaciones, una escena de cinco minutos, mantra y acción.
    #: Con 4000 la respuesta se cortaría a media llave, que es el peor fallo:
    #: no es un error de red y hay que detectarlo a mano.
    agent_max_output_tokens: int = Field(default=8000)
    agent_thinking_budget: int = Field(default=2048)

    #: Por debajo del presupuesto que le da LifeOS (20 s), para que el agente
    #: falle ANTES de que el otro lado se canse y así el respaldo tenga tiempo.
    agent_timeout_s: float = Field(default=45.0)
    lifeos_timeout_s: float = Field(default=10.0)

    log_level: str = Field(default="INFO")
    agent_version: str = Field(default="1.0.0")


@lru_cache
def get_settings() -> Settings:
    return Settings()
