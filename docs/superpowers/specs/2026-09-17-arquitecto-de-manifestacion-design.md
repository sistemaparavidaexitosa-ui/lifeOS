# Arquitecto de Manifestación — diseño (el agente que escribe tu mañana)

**Fecha:** 2026-09-17 · **Estado:** diseño aprobado. Fases en la tabla del final.

## Contexto

F4 (D-161, migraciones 0064/0065) ya escribe cada día un brief de identidad: cinco
afirmaciones, una visualización de 2-4 minutos, un recordatorio, una pregunta y una cita
original inspirada en principios de Hill, Goddard, Clear y Sharma. La parte difícil está
resuelta y probada: `sanearBrief` no confía en que el prompt se obedezca — descarta
afirmaciones repetidas por Jaccard, detecta citas atribuidas y verifica que cada rasgo y
cada hecho citado exista.

Lo que falta para que esto sea un pilar diferenciador y no una tarjeta más:

- un **mantra** de una frase que se pueda repetir todo el día;
- una **acción concreta** —no abstracta— alineada con la identidad futura;
- **categorías** de afirmación, y **volumen** suficiente (10-20, no 5);
- una **visualización de ~5 minutos** con arco narrativo completo;
- y sobre todo **aprendizaje real**: que el sistema observe qué estilo de brief acompaña a
  mejores días y se incline hacia él, en vez de limitarse a no repetirse.

**Decisiones del usuario (2026-09-17):**

- **El agente es un servicio Python aparte**, en `agents/`, con los nueve módulos pedidos.
  Se acepta el coste (segundo despliegue, segundo CI, más latencia) a cambio de que el
  agente evolucione con su propio ciclo.
- **Python no toca Supabase.** Pide el contexto a LifeOS por HTTP y devuelve el brief en la
  respuesta.
- **Python sustituye al generador de F4; `generar.ts` queda como respaldo.** Nadie se queda
  sin brief porque un contenedor esté caído.
- **Aprendizaje por libro de estilo con correlación**, calculado en TypeScript.

## Invariantes que NO se tocan

1. **El modelo no calcula.** Toda cifra sale de funciones puras en `src/lib/domain/**`.
2. **`buildContext`, `TABLAS_CONSULTABLES` y `profiles.ai_domains` siguen siendo la puerta
   de privacidad.** El endpoint nuevo la respeta explícitamente o no es una puerta.
3. **Sin embeddings** (invariante del sistema cognitivo). La comparación de afirmaciones
   sigue siendo Jaccard sobre palabras significativas.
4. **Las citas son originales.** Nunca se copia ni se atribuye. Dispenza entra como quinta
   inspiración y, por tanto, también como quinto nombre que `citaAtribuida` debe detectar.
5. **D-148:** los briefs y las puntuaciones son eventos, no nodos del grafo.
6. **El saneado de LifeOS es la autoridad.** Lo que devuelve Python pasa por `sanearBrief`
   igual que lo que devuelve el respaldo.

## Las 11 categorías no sustituyen a las 7 áreas

Las 7 áreas de `identity_traits.area` y `personal_goals.area` son estructurales: alimentan
el radar de Analítica y el componente «equilibrio» del Identity Score. Ampliarlas a 11
obligaría a migrar datos y repintar el radar, todo por una etiqueta de presentación.

La categoría vive **dentro del jsonb `affirmations`** y una función pura la proyecta a un
área:

| Categoría | Área |
|---|---|
| Carrera, Negocio, Liderazgo | Carrera |
| Dinero | Finanzas |
| Salud | Salud |
| Relaciones | Relaciones |
| Aprendizaje | Aprendizaje |
| Propósito, Espiritualidad | Espiritual |
| Disciplina, Confianza | Personal |

La UI agrupa por las 11 —que es lo que hace legible una lista de veinte— y todo lo que
agrega (`focus_area`, el score, el radar) sigue hablando en las 7 de siempre. `focus_area`
es un **área**, no una categoría, precisamente para poder cruzarse con el score.

## Topología

```
Server Action ──POST──> Python /manifestation/daily
                            │
     Next.js <──POST /api/agents/manifestation/context──┘
        │ loadScoreContext() · loadFacts() · buildContext() · libroDeEstilo()
        └──> { contextVersion, token, ...contexto }
                            │
                      Python ──> Gemini
Server Action <──payload── Python
     │
     └─ sanearBrief()  ← la autoridad
     └─ guardarBrief() → identity_briefs + identity_brief_style + audit_log
```

**Por qué Python devuelve el brief en vez de escribirlo.** La Server Action ya tiene la
sesión; que ella haga el `insert` mantiene la escritura bajo la RLS de siempre y deja una
sola llamada entrante en lugar de dos.

**Por qué un token HMAC además del secreto.** El endpoint de contexto recibe un `user_id` y
devuelve datos íntimos de esa persona. Hoy ningún secreto del repo hace eso:
`PUSH_DISPATCH_SECRET` dispara trabajo, no devuelve contenido. El token (HMAC de
`userId|localDate|issuedAt`, diez minutos de vida) ata el contexto al guardado e impide
replays y cruces de usuario o de fecha. Y cada lectura se audita en `audit_log`, visible
para la persona: si un secreto puede leer la identidad de cualquiera, la persona tiene que
poder ver cuándo se leyó la suya.

## El aprendizaje: TypeScript mide y calcula, Python redacta

`src/lib/domain/identity/estilo.ts`, puro:

- **`etiquetarEstilo`** — al guardar, deriva del propio brief: tono, longitud media, tipo
  de escena, si usa cifras, mezcla de categorías. Sin modelo, determinista.
- **`medirDia`** — la noche siguiente: cumplimiento, ánimo, energía, reacciones, acción
  hecha, y un `outcomeScore` 0-100 con los pesos renormalizados sobre los componentes
  presentes. Con menos de dos componentes → `null`: un día medido solo por el ánimo no es
  un día medido.
- **`libroDeEstilo`** — la correlación. Una etiqueta se conserva solo con `n ≥ 7`,
  `nSin ≥ 4` y `|lift| ≥ 6` puntos, y se recalcula quitando el mejor día del grupo: si el
  signo se invierte, se descarta. Con menos de 14 días medidos no se devuelve **ninguna**
  preferencia. Tope de 3.

Por qué en TypeScript y no en Python, que es donde vive el agente:

1. Lee datos que solo LifeOS tiene (`habit_logs`, `daily_reflections`, `reactions`).
   Calcularlo fuera obligaría a enviar el crudo de treinta días por el cable cada mañana.
2. **Tiene que sobrevivir a Python caído.** Si vive en Python, el respaldo genera sin
   preferencias y la calidad se degrada justo el día en que más se nota.
3. Es la pieza con más probabilidad de estar mal —estadística con n pequeño— y la más
   barata de probar aquí, donde ya hay cincuenta y cinco tests de dominio.

Frontera: **TS mide, Python escribe.** Python recibe las preferencias con su `lift` y su
`n` y decide cómo usarlas en el prompt.

Efecto deseado que hay que documentar para que nadie lo «arregle»: si un tono se refuerza
tanto que deja de haber días sin él, `nSin` cae por debajo de 4, la preferencia se cae sola
y el sistema vuelve a explorar.

## Lo que NO se crea, y por qué

- **Tabla de memoria propia del agente.** La memoria diaria ya vive en `identity_briefs`,
  `identity_scores`, `daily_reflections` y `habit_logs`. Una tabla paralela sería un
  segundo origen de verdad que se desincroniza en cuanto alguien borre su historial de IA.
- **Taxonomía nueva de áreas.** Ver arriba.
- **Embeddings para deduplicar afirmaciones.** Jaccard basta para frases cortas y se puede
  explicar; es invariante del sistema cognitivo.
- **Circuit breaker para el agente.** En serverless no hay estado entre invocaciones que lo
  sostenga; fingirlo sería peor que no tenerlo.
- **Voz, TTS, audio, música y notificaciones inteligentes.** La arquitectura no los impide
  —`visualization.steps[].text` son ya las unidades que un TTS trocearía, y el router está
  separado del agente— pero no se implementa nada de eso ahora.

## Riesgos aceptados

| Riesgo | Mitigación |
|---|---|
| El p95 del botón empeora: dos saltos de red más | Python devuelve el brief en su respuesta: una llamada entrante, no dos. Se acepta por escrito. |
| El secreto es autoridad total sobre cualquier `user_id` | Secreto propio y distinto, token HMAC, contexto acotado, auditoría de cada lectura, tope diario en `ai_job_runs`. |
| El opt-in de `ai_domains` se salta por la puerta nueva | Comprobación explícita en el endpoint y un test que la fija. Es el fallo más caro y más fácil de cometer. |
| Jaccard y la detección de atribución duplicados en dos lenguajes | TS es la autoridad: el guardado siempre re-sanea. Las copias en Python ahorran un reintento, no protegen nada. |
| `pnpm verify` deja de cubrir la funcionalidad entera | Cubre al 100 % el camino del respaldo, que es lo único que garantiza que la persona recibe un brief. |
| Dos despliegues que se desincronizan | `contextVersion` en el payload; Python rechaza la versión que no conoce y el lado TS cae al respaldo. |

## Fases

| # | Fase | Hecho cuando… |
|---|---|---|
| 0 | D-164 y este documento | El mapeo categoría→área y el reparto de grants están por escrito |
| 1 | Migración `0067` + pgTAP `0040` | `supabase db test` verde; `gen:types` trae las columnas nuevas |
| 2 | Puro TS: `brief.ts` parametrizado + `estilo.ts` + tests | `pnpm test:unit` verde, y los tests nuevos fallaban antes |
| 3 | Extraer `agent-context.ts` y `guardar-brief.ts` sin cambiar conducta | El brief actual se genera y guarda idéntico |
| 4 | UI, `brief-view.ts`, el regex `a1..a20`, Dispenza | Una fila con mantra se pinta; una de respaldo no se rompe |
| 5 | Endpoints, `env.ts`, `middleware.ts` | Un payload malicioso se guarda saneado o se rechaza, nunca crudo |
| 6 | Servicio Python + pytest | `make test` verde; extremo a extremo produce `generator='py'` |
| 7 | Cableado del respaldo | Con la URL apuntando a un agujero negro, el brief aparece igual |
| 8 | Bucle de aprendizaje | 20 días sintéticos → 1-3 preferencias; 10 días → cero, con su explicación |
| 9 | Docs: `CHECKS.md`, `TRACEABILITY.md`, `DEPLOY.md` | `CHECKS.md` dice qué se corrió de verdad y qué no |

Las fases 1-4 no dependen de Python: si el agente se abandona, lo entregado sigue siendo un
brief mejor. Ese es el orden a propósito.
