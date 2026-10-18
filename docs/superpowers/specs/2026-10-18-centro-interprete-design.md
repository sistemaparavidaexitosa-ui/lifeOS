# El Centro entiende sin IA y hace lo que la persona hace

Fecha: 2026-10-18 · Rama: `feat/centro-interprete` · Decisiones: D-205 en adelante · Sin migración (E1)

## Por qué

Encargo de la persona (2026-10-18), con sus palabras:

> crea un Agente de interpretación de instrucciones en chat CENTRO, para no
> quemar tokens de IA, el agente interpreta palabras del usuario para
> relacionar con todas las tablas existentes, centro toma esta retro y consulta
> siempre al usuario si el entendimiento es correcto, dejamos a la IA para
> tareas de verdadero valor. Centro ahora debe ser capaz de hacer todo lo que el
> usuario hace, escribir en cada formulario, tomar acciones, es una réplica de
> las acciones que puede realizar el usuario, el usuario solo tiene que pedirlo.

Pidió empezar sin preguntas: **todo lo que no está en esa cita es decisión de
quien construye** y se marca así.

Estado de partida (verificado en el código, 2026-10-18):

- **Cada mensaje al Centro llama a Gemini** (`pensarTurno`, hasta 6 rondas de
  herramientas y 6000 tokens de salida), también «crea una tarea: llamar a Juan».
- **El Centro escribe en 3 tablas** (`tasks`, `notes`, `food_entries`, D-203
  entrega 1). La entrega 2 («resto de tablas») nunca se hizo.
- La tarjeta `propuestaCambio` ya ES un «¿entendí bien?»: enseña los campos,
  deja corregirlos, Guardar / Descartar / «No es esto».
- `buscar_en_todo` (RPC, D-198) encuentra filas por nombre sin exactitud, con RLS.

## Qué se construye

### 1. El intérprete (sin modelo)

Una función pura, `interpretar(texto, catalogo, hoy)`, que convierte una
petición en UNA de cuatro salidas:

| Salida | Cuándo | Lo que ve la persona |
|---|---|---|
| `cambios` | verbo + tabla claros y todos los obligatorios resueltos | la tarjeta `propuestaCambio` encabezada por «Entendí: …» |
| `pregunta` | falta UNA cosa que se puede elegir de una lista (¿en qué proyecto?, ¿cuál de estas tres tareas?) | «Entendí: … ¿En cuál?» con botones |
| `navegar` | «abre / llévame a / ve a» + una sección | botón «Ir a …» (sin modelo) |
| `ia` | todo lo demás | el turno de siempre, con el modelo |

**LA REGLA DE ORO (como en D-168): ante cualquier duda, `ia`.** El intérprete
nunca adivina: un falso positivo pinta una tarjeta equivocada, que la persona
tiene que rechazar, y eso cuesta más que los tokens que ahorra.

Decide `ia` sin mirar más cuando el texto pide criterio: preguntas («¿cómo
voy…?», «¿por qué…?», «¿cuánto…?»), análisis, consejo, planear, resumir,
comparar, recomendar, o un texto de más de 300 caracteres. **Leer y calcular
también son de la IA** en E1: la persona dijo «tareas de verdadero valor», y
responder sobre sus datos lo es.

**Cómo entiende** (todo en `src/lib/domain/centro/interprete/`):

- `normalizar`: minúsculas, sin acentos, espacios simples; el texto entre
  comillas se conserva tal cual (es el título).
- **Verbos → operación:** crear (`crea, agrega, añade, anota, apunta, registra,
  nueva/o, comí, desayuné, almorcé, cené`), editar (`cambia, mueve, marca,
  pasa, pon, actualiza, renombra, pospón, completa, termina`), borrar (`borra,
  elimina, quita`).
- **Sustantivos → tabla:** cada entrada de `ESCRITURA_POR_TABLA` gana
  `sinonimos` (obligatorio por tipo: una tabla nueva sin vocabulario no
  compila). Una palabra que apunta a dos tablas = `ia`.
- **Valores por tipo de campo** (extractores puros): fechas (`hoy, mañana,
  pasado mañana, ayer, el lunes…, el 25, 25 de octubre, en 3 días, la próxima
  semana, AAAA-MM-DD`), números con unidad (`80 g`, `$350`, `30 min`), opciones
  por sinónimo declarado en el campo (`urgente/alta → High`, `desayuno →
  Desayuno`, `hecha/terminada → Completed`).
- **Refs** (`project_id`, `notebook_id`): «en (el proyecto|el cuaderno) X» →
  búsqueda aproximada en el catálogo. Sin mención y una sola opción → esa. Sin
  mención y varias → `pregunta` con hasta 3 (las más recientes).
- **Fila a editar/borrar:** lo que queda tras quitar verbo, sustantivo y
  valores es el término de búsqueda → `buscar_en_todo` sobre ESA tabla. Una
  coincidencia clara → esa; 2–3 → `pregunta`; ninguna → «No encontré ninguna
  tarea que se llame «…»» con el botón de la IA.
- **Título** (crear): el texto entre comillas si lo hay; si no, lo que queda.

### 2. Integración en el turno

1. `POST /api/centro/turno` acepta `modo: "auto" | "ia"` (por defecto `auto`).
2. `pensarTurno` prepara el cerebro (sin cambios) y, en `auto`, corre primero
   `interpretarTurno` (servidor): carga el catálogo (proyectos y cuadernos con
   la RLS de la sesión), llama al intérprete y, si hace falta, a
   `buscar_en_todo`. **Cero llamadas al modelo.**
3. La salida `cambios` sale con **exactamente el mismo contrato que el bloque
   `propuesta_cambio` del modelo** y entra por `proponerCambios`. Todas las
   barreras de D-203 se heredan sin código nuevo: registro, `ai_domains`, fila
   leída (las filas del catálogo y de la búsqueda las leyó el servidor con la
   sesión), zod, `coach_proposals`, revalidación al Guardar, auditoría.
4. Si la salida es `ia`, o el intérprete falla o lanza, el turno sigue igual
   que hoy. `Sí, sigue:` y `No era eso` (texto que generan las tarjetas de la
   IA) van siempre a la IA.

### 3. «Consulta siempre si el entendimiento es correcto»

- La sección `propuestaCambio` gana dos campos opcionales: `entendi` (una frase:
  «Crear la tarea «Llamar a Juan» en Rediseño, vence mañana») y `textoOriginal`.
  La tarjeta del intérprete se titula **«Entendí: …»** y nada se guarda sin
  pulsar Guardar (que ya era la regla de D-203).
- **«No es esto»** en una tarjeta del intérprete descarta (con el
  `malentendido` de D-204) y reenvía el texto original en `modo: "ia"`: la
  persona no tiene que reescribir nada.
- Marca discreta «sin IA» en la tarjeta (decisión mía): la persona ve cuándo
  ahorró tokens y cuándo no.

### 4. La retroalimentación

Cada turno resuelto por el intérprete deja `audit_log`
`ai.centro_interprete` `{ salida, tabla, operacion }`. Con lo que ya existe
(`ai.centro_escritura` al guardar, `ai.centro_entendimiento` en «No es esto»)
se puede medir el acierto: propuestas del intérprete guardadas vs. rechazadas.
**Aprender sinónimos nuevos de esos rechazos queda fuera de E1** (decisión mía:
primero hay que ver datos reales).

### 5. Réplica de lo que hace la persona

«Escribir en cada formulario, tomar acciones» = la entrega 2 del spec D-203,
ahora con vocabulario. Cada tabla nueva = entrada en el registro (con
`sinonimos`) + adaptador a la server action de su pantalla. Las acciones que no
son crear/editar/borrar se modelan sobre la tabla donde dejan huella (marcar un
hábito = crear en `habit_logs`; aportar a un ahorro = editar `savings_goals`
con su acción `contributeToSaving`).

Orden (decisión mía, por frecuencia de uso):

- **E1** — intérprete + integración + tarjeta + retro, sobre las 3 tablas de
  hoy y la navegación.
- **E2** — los formularios del día a día: `habit_logs` (marcar hecho),
  `reminders`, `projects`, `personal_goals`, `books` (+ página actual),
  `savings_goals` (+ aportar), `debts`, `financial_goals`, `assets`,
  `occupations`, `logbook`, `daily_reflections`.
- **E3** — dinero con asientos (`journal_entries` vía `postTransaction`,
  `accounts`, `budgets`), identidad, nutrición (perfil, peso), comentarios y
  asignaciones de tareas, y el resto del registro de D-203.

La lista de PROHIBIDAS de D-203 no cambia: el Centro jamás escribe `profiles`,
compartición, grafo ni derivadas. «Todo lo que hace la persona» no incluye
cambiar quién ve qué ni sus propios permisos.

## Fuera de alcance

- Que el Centro guarde sin Guardar (D-203 lo descartó; la persona pidió
  «consulta siempre»).
- Responder preguntas sobre los datos sin modelo (E1 las manda a la IA).
- Aprender sinónimos solo.
- Un segundo modelo «pequeño» para interpretar: la persona pidió no quemar
  tokens, y un modelo pequeño sigue siendo tokens.

## Pruebas

- **Dominio** (`node --test`): normalizar; cada extractor de fechas/números/
  opciones; verbos y sinónimos; un caso por tabla escribible (crear, editar,
  borrar); ambigüedad → `pregunta`; dudas → `ia`; las preguntas y análisis
  siempre `ia`; el contrato de salida pasa `validarCambio` (mismo test que el
  del modelo); test de cobertura: toda tabla del registro tiene `sinonimos` y
  ningún sinónimo apunta a dos tablas.
- **Navegador** (Chromium local, base local): «crea una tarea llamar a Juan
  mañana» → tarjeta «Entendí» sin llamada al modelo → Guardar → la tarea
  existe; «No es esto» → turno de IA (en local responde la disculpa: sin
  `GEMINI_API_KEY`, se dice en el PR).
