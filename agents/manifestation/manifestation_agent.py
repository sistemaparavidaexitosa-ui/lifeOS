"""El orquestador: reúne, pide UNA vez, valida, y como mucho reintenta una.

UNA SOLA LLAMADA AL MODELO, NO UNA POR MOTOR. Es la decisión de diseño con más
consecuencias de este paquete, y va contra la lectura ingenua de «un motor por
pieza». Los motores de este agente son planificadores y validadores, no
interlocutores: `affirmation_engine` decide qué pedir y qué aceptar,
`visualization_engine` decide qué forma tiene la escena, pero ninguno habla con
el modelo. Tres llamadas triplicarían coste y latencia y, sobre todo,
producirían un mantra que no conversa con las afirmaciones y una escena que no
sabe de qué van — que es exactamente el defecto que hace que un brief se sienta
ensamblado en vez de escrito.

DEPENDENCIAS INYECTADAS. `client`, `provider` y `clock` entran por el
constructor, así que el agente entero se prueba sin red y sin reloj.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from . import affirmation_engine, identity_engine, manifestation_prompts, profile_builder, visualization_engine
from .config import Settings
from .errors import ProfileIncomplete, ValidationFailed
from .gemini import Provider, response_schema
from .manifestation_memory import DailyMemory, LifeOSClient
from .manifestation_models import (
    AccionOut,
    AfirmacionOut,
    Area,
    Category,
    AgentResponse,
    BriefPayload,
    CitaOut,
    LifeOSContext,
    ManifestationBrief,
    PasoOut,
    Principle,
    VisualizacionOut,
)

#: Uno. Un segundo reintento se come el presupuesto que LifeOS reservó para su
#: respaldo, y un brief tardío es peor que un brief más corto a tiempo.
MAX_REINTENTOS = 1


class ManifestationArchitect:
    def __init__(
        self,
        client: LifeOSClient,
        provider: Provider,
        settings: Settings,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._client = client
        self._provider = provider
        self._s = settings
        self._clock = clock

    async def generate_daily_manifestation(self, user_id: str, local_date: str | None = None) -> ManifestationBrief:
        """La API pública. Devuelve el brief; no lo guarda."""
        respuesta = await self.produce(user_id, local_date)
        return ManifestationBrief.de_payload(respuesta.payload, self._clock())

    async def produce(self, user_id: str, local_date: str | None = None) -> AgentResponse:
        """Lo mismo, pero con el sobre completo que espera LifeOS."""
        contexto = await self._client.fetch_context(user_id, local_date)
        return await self.produce_desde(contexto, user_id)

    async def produce_desde(self, contexto: LifeOSContext, user_id: str) -> AgentResponse:
        """El camino sin red, para poder probarlo entero."""
        if not contexto.identity.desired.strip():
            # Se comprueba aquí además de en LifeOS. No es desconfianza: es que
            # este es el punto donde el fallo tiene un mensaje útil, y un brief
            # sin identidad declarada sería genérico por construcción.
            raise ProfileIncomplete("Primero di en quién te estás convirtiendo: tu brief se escribe a partir de eso.")

        profile = profile_builder.build(contexto, user_id)
        memoria = DailyMemory(contexto)
        narrativa = identity_engine.compose(profile)
        slate = affirmation_engine.plan(profile)

        rasgos_validos = {t.id for t in contexto.traits}
        hechos_validos = set(narrativa.citable_facts)
        previas = memoria.afirmaciones_previas

        esquema = response_schema(
            # El vocabulario lo manda LifeOS, que es quien guarda. Los enums de
            # aquí son el respaldo para cuando se prueba sin contexto completo.
            categorias=contexto.vocabulary.categorias or [c.value for c in Category],
            areas=contexto.vocabulary.areas or [a.value for a in Area],
            principios=contexto.vocabulary.principios or [p.value for p in Principle],
            max_afirmaciones=profile.limits.maxAffirmations,
            max_pasos=profile.limits.maxSteps,
        )

        correcciones: list[str] = []
        ultimo_error: list[str] = []

        for intento in range(MAX_REINTENTOS + 1):
            crudo, modelo = await self._provider.generate_json(
                system=manifestation_prompts.system(profile),
                prompt=manifestation_prompts.user(profile, narrativa, slate, previas, correcciones or None),
                schema=esquema,
            )

            payload, problemas = self._armar(
                crudo,
                profile=profile,
                previas=previas,
                rasgos_validos=rasgos_validos,
                hechos_validos=hechos_validos,
            )

            if payload is not None and not problemas:
                return AgentResponse(
                    ok=True,
                    model=modelo,
                    agentVersion=self._s.agent_version,
                    promptVersion=manifestation_prompts.PROMPT_VERSION,
                    payload=payload,
                )

            ultimo_error = problemas
            correcciones = problemas
            if intento == MAX_REINTENTOS and payload is not None:
                # Se sostiene con defectos menores: vale más un brief imperfecto
                # que ninguno. El saneado de LifeOS tendrá la última palabra.
                return AgentResponse(
                    ok=True,
                    model=modelo,
                    agentVersion=self._s.agent_version,
                    promptVersion=manifestation_prompts.PROMPT_VERSION,
                    payload=payload,
                )

        raise ValidationFailed("El agente no consiguió un brief que se sostuviera.", ultimo_error)

    def _armar(
        self,
        crudo: dict,
        *,
        profile: profile_builder.ManifestationProfile,
        previas: list[str],
        rasgos_validos: set[str],
        hechos_validos: set[str],
    ) -> tuple[BriefPayload | None, list[str]]:
        problemas: list[str] = []

        refinado = affirmation_engine.refine(
            list(crudo.get("afirmaciones") or []),
            previas=previas,
            rasgos_validos=rasgos_validos,
            maximo=profile.limits.maxAffirmations,
        )
        problemas.extend(refinado.problemas)
        if len(refinado.aceptadas) < profile.limits.minAffirmations:
            problemas.append(
                f"Quedaron {len(refinado.aceptadas)} afirmaciones utilizables y hacen falta al menos "
                f"{profile.limits.minAffirmations}. Escribe otras con ideas distintas."
            )

        vis = crudo.get("visualizacion") or {}
        validada = visualization_engine.validate(
            list(vis.get("pasos") or []),
            min_segundos=profile.limits.visualizationSeconds.get("min", 240),
            max_segundos=profile.limits.visualizationSeconds.get("max", 420),
            max_pasos=profile.limits.maxSteps,
        )
        problemas.extend(validada.problemas)

        cita = crudo.get("cita") or {}
        texto_cita = str(cita.get("texto") or "")
        if not texto_cita or affirmation_engine.cita_atribuida(texto_cita):
            problemas.append("La cita está vacía o atribuida a un autor: tiene que ser original y sin nombres.")
            texto_cita = ""

        try:
            principio = Principle(str(cita.get("principio") or "clear"))
        except ValueError:
            principio = Principle.CLEAR

        mantra = str(crudo.get("mantra") or "").strip() or None
        if mantra and len(mantra.split()) > profile.limits.mantraMaxWords:
            problemas.append(f"El mantra tiene {len(mantra.split())} palabras y el tope son {profile.limits.mantraMaxWords}.")
            mantra = None

        accion = crudo.get("accionDelDia") or {}
        accion_out = None
        if texto_accion := str(accion.get("texto") or "").strip():
            rasgo = str(accion.get("rasgoId") or "")
            # Un área que no está en el enum se cae sola: es una etiqueta, y
            # perderla no vale tumbar la acción entera.
            try:
                area = Area(str(accion.get("area") or ""))
            except ValueError:
                area = None
            accion_out = AccionOut(
                texto=texto_accion,
                rasgoId=rasgo if rasgo in rasgos_validos else "",
                area=area,
            )

        if not refinado.aceptadas or not validada.pasos:
            return None, problemas

        payload = BriefPayload(
            afirmaciones=[AfirmacionOut(**a) for a in refinado.aceptadas],
            visualizacion=VisualizacionOut(
                titulo=str(vis.get("titulo") or "Tu día, ya vivido"),
                pasos=[PasoOut(texto=p["texto"], segundos=p["segundos"]) for p in validada.pasos],
            ),
            recordatorio=str(crudo.get("recordatorio") or "").strip(),
            pregunta=str(crudo.get("pregunta") or "").strip(),
            cita=CitaOut(texto=texto_cita or "Lo que repites cuando no te apetece es lo que de verdad eres.", principio=principio),
            mantra=mantra,
            accionDelDia=accion_out,
            focusArea=str(crudo.get("focusArea") or "") or None,
            # Solo los hechos que EXISTEN. Un factId inventado no se descarta
            # aquí por desconfianza del modelo: es que LifeOS lo descartaría
            # igual, y así el reintento no gasta una llamada en algo que ya se
            # sabe que se va a caer.
            factIds=[f for f in (crudo.get("factIds") or []) if f in hechos_validos],
        )

        if not payload.recordatorio:
            problemas.append("Falta el recordatorio de identidad.")
        if not payload.pregunta:
            problemas.append("Falta la pregunta de reflexión.")

        return payload, problemas
