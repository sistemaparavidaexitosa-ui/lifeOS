# Arquitecto de Manifestación

El agente que escribe el brief de identidad diario de LifeOS: de diez a veinte
afirmaciones con categoría, una visualización guiada de unos cinco minutos, un
mantra de una frase y una acción concreta que se pueda terminar hoy.

Es un servicio aparte, en Python. No es un adorno de arquitectura: **no toca la
base de datos**. Pide el contexto a LifeOS por HTTP, llama al modelo, y devuelve
el brief. Quien guarda, sanea y decide qué es válido sigue siendo LifeOS.

Decisión y razones: `docs/DECISIONS.md`, D-164.
Diseño completo: `docs/superpowers/specs/2026-09-17-arquitecto-de-manifestacion-design.md`.

## Cómo encaja

```
Server Action ──POST /manifestation/daily──> este servicio
                                                  │
    LifeOS <──POST /api/agents/manifestation/context──┘
       │  loadScoreContext · loadFacts · buildContext · libroDeEstilo
       └──> { contextVersion, token, identidad, rasgos, hechos, estilo… }
                                                  │
                                            este servicio ──> Gemini
Server Action <──── payload ──── este servicio
       │
       └─ sanearBrief()   ← LA AUTORIDAD, en TypeScript
       └─ guardarBrief()  → identity_briefs + identity_brief_style + audit_log
```

**LifeOS nunca depende de que esto esté vivo.** Si el servicio no responde
—no configurado, timeout, 5xx, o un payload que no pasa el esquema— el brief lo
escribe `src/lib/identity/generar.ts`, y la fila guardada lo dice en la columna
`generator`. Un contenedor caído se nota en un brief más corto, nunca en una
mañana sin brief.

## Empezar

```bash
make install          # crea .venv con uv e instala en modo editable
cp .env.example .env  # y rellena los secretos
make test             # 61 pruebas, sin red
make run              # uvicorn en :8080 con recarga
```

## Los módulos, y qué hace cada uno

| Archivo | Responsabilidad |
|---|---|
| `manifestation_models.py` | Solo datos. Pydantic estricto e inmutable. Nada de red. |
| `manifestation_memory.py` | **El único** que habla con LifeOS. Sin estado local. |
| `profile_builder.py` | Del contexto a un perfil con el que decidir. Puro. |
| `identity_engine.py` | Quién quiere llegar a ser, y en qué área toca insistir hoy. Puro. |
| `affirmation_engine.py` | Planifica cuántas afirmaciones y de qué; filtra las repetidas. Puro. |
| `visualization_engine.py` | El arco de nueve tiempos y el reparto del reloj. Puro. |
| `manifestation_prompts.py` | Solo texto. Aquí vive `PROMPT_VERSION`. |
| `gemini.py` | El único que habla con un modelo. Nunca lanza sin tipar. |
| `manifestation_agent.py` | Orquesta. Dependencias inyectadas. |
| `manifestation_router.py` | FastAPI. El mapeo de errores es parte del contrato. |

## Tres decisiones que sorprenden al leer el código

**Una sola llamada al modelo, no una por motor.** Los motores planifican y
validan; ninguno conversa. Tres llamadas triplicarían coste y latencia y darían
un mantra que no conversa con las afirmaciones — el defecto que hace que un
brief se sienta ensamblado en vez de escrito.

**El aprendizaje se calcula en TypeScript, no aquí.** Este servicio recibe las
preferencias de estilo ya calculadas, con su `lift` y su `n`, y decide cómo
redactarlas. Vive allí porque lee datos que solo LifeOS tiene, porque tiene que
sobrevivir a que este contenedor esté caído, y porque es la pieza con más
probabilidad de inventarse un patrón — la que más conviene tener bajo
`pnpm verify`. Frontera: **TypeScript mide, Python escribe.**

**Las copias del saneado no protegen nada.** El Jaccard y la detección de
atribución de `affirmation_engine` son un espejo de los de TypeScript. Sirven
para ahorrar un reintento, porque una repetición detectada aquí se reescribe
antes de mandar nada. La autoridad es `sanearBrief`, que vuelve a pasarlo todo.

## El contrato de errores

El código de estado es lo que usa LifeOS para decidir si cae a su respaldo.
No es un detalle de presentación:

| Estado | Qué significa | Qué hace LifeOS |
|---|---|---|
| 200 | El brief está escrito | Lo sanea y lo guarda |
| 401 | Secreto de entrada malo o ausente | Cae al respaldo |
| 409 | Falta identidad declarada, o la IA está apagada | **No** cae: el respaldo fallaría igual |
| 422 | Ni el reintento se sostuvo | Cae al respaldo |
| 502 | LifeOS no contestó, o habla otra versión de contexto | Cae al respaldo |
| 503 | El modelo no está disponible | Cae al respaldo, y rápido |

Un 503 tarda unos 300 ms a propósito: cuanto antes falle esto, más presupuesto
le queda al respaldo.

## Configuración

Ver `.env.example`. Los dos secretos son distintos porque protegen direcciones
opuestas: `AGENT_INBOUND_SECRET` es el que este servicio exige a quien le llama,
y `LIFEOS_AGENT_SECRET` el que presenta a LifeOS para pedir el contexto.

## Despliegue

Contenedor de vida larga (Fly.io, Railway, Render), no función serverless: este
salto ya está en medio de una cadena que alguien espera con un botón pulsado, y
un arranque en frío aquí se nota.

```bash
docker build -t manifestation-architect .
docker run -p 8080:8080 --env-file .env manifestation-architect
```

En LifeOS hay que poner `MANIFESTATION_AGENT_URL` y
`MANIFESTATION_AGENT_SECRET`. Sin ellas el producto funciona entero con el
respaldo, que es exactamente lo que debe pasar.

## Lo que este servicio NO hace, y no es un olvido

- **No guarda estado.** La memoria diaria vive en Postgres, donde tiene RLS,
  respaldo y un «borrar mi historial de IA» que de verdad borra. Un almacén
  aquí sería un segundo origen de verdad que sobrevive a ese borrado.
- **No importa ningún cliente de base de datos.** Hay un test que lo comprueba
  recorriendo los `import` del paquete: es un invariante de la topología, no una
  preferencia de estilo.
- **No hace voz ni audio.** `visualization.steps[].text` son ya las unidades que
  un TTS trocearía, y el router está separado del agente para que un
  `POST /manifestation/audio` futuro reutilice el mismo brief. Nada más.
