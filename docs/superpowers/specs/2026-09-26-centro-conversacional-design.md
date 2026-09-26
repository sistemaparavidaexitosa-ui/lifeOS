# El Centro conversa: confirma lo que entendió, enseña lo que sabe hacer y aprende

Fecha: 2026-09-26 · Rama: `feat/centro-conversacional` · Decisiones: D-204 en adelante · Migración: 0079

Subproyecto **A** de cuatro (orden acordado: A → C Journal → D agente psicológico
→ B resto de tablas). Se apoya en D-203 (el Centro propone cambios y la persona
guarda), fusionado en `main` vía #80.

## Qué pidió la persona

> «Centro debe preguntar antes de realizar una acción, debe mostrar sugerencias de
> sus capacidades para que el usuario comprenda las posibilidades […]. Amplía más
> el ancho de respuesta, pregunta también si su entendimiento es correcto para
> proseguir, y da sugerencias de otras posibilidades. Centro aprende sobre esto.»

| Pregunta | Decisión |
|---|---|
| «Preguntar antes de actuar» | Ya se cumple: nada se escribe sin Guardar (D-203). Se añade «No es esto» a las tarjetas. |
| «Ampliar el ancho» | **Respuestas más largas** (más texto y más bloques), no una columna más ancha. |
| Cuándo confirma el entendimiento | **Solo si hay duda**: petición ambigua, más de un cambio, un borrado, o una interpretación que la persona no dijo. Si es clara, tarjetas directas. |
| Cómo aprende | **Solo, pero visible**: deduce preferencias de los resultados y las escribe en la memoria de IA sin preguntar; se ven y se borran en `/intelligence/memory`. |
| Dónde enseña capacidades | **Al abrir**: chips de ejemplo con el hilo vacío. |
| Enfoque de aprendizaje | **En la conversación** (sin proceso nocturno, sin llamada extra al modelo). |

## Alcance

### 1. Respuestas más largas

- `MAX_TEXTO` (contrato.ts) 600 → **2000**. `MAX_BLOQUES` 4 → **6**.
- `CENTRO_AGENTE_BUDGET.maxOutputTokens` 4000 → **6000** (thinkingBudget sigue en 256).
- `SYSTEM_AGENTE`: «1–3 frases» pasa a «lo que haga falta, hasta cuatro párrafos
  cortos; breve si basta». El esquema de respuesta (`ESQUEMA_RESPUESTA.texto`)
  cambia su descripción igual.
- La burbuja ya respeta saltos de línea (`white-space: pre-wrap`); no hay cambio de
  interfaz.
- Riesgo anotado: más salida = más tiempo contra `maxDuration = 60` de
  `/api/centro/turno`. Se mide con el modelo real antes de encender el flag.

### 2. Confirmar el entendimiento

Bloque nuevo en `KINDS_DEL_AGENTE`, mismo sobre `{ kind, datos: "<JSON>" }`:

```json
{ "kind": "confirmar_entendimiento", "datos": {
  "entendi": "Quieres registrar la avena del desayuno y mover «Leer» a mañana.",
  "seguir": "Sí, hazlo",
  "alternativas": [
    { "etiqueta": "Solo la comida", "texto": "Solo registra la avena" },
    { "etiqueta": "Otra cosa", "texto": null }
  ] } }
```

- `entendi`: 1–300 caracteres. `seguir`: 1–40. `alternativas`: 0–3, `etiqueta`
  1–40, `texto` 1–300 o `null`. Sin marcado. `rotuloConCifras` no aplica a
  `entendi` (puede citar lo que la persona dijo).
- Sección nueva del runtime `confirmarEntendimiento` con el mismo contenido y su
  zod en `validador.ts`.
- Tarjeta: «Entendí: …» + botones. `seguir` envía el texto «Sí, sigue» como turno
  nuevo; una alternativa con texto envía ese texto; una con `texto: null` enfoca
  el Composer. La tarjeta se desactiva tras el primer clic.
- **Regla del prompt:** si la petición es ambigua, implica más de un cambio, incluye
  un borrado, o interpretas algo que la persona no dijo, primero
  `confirmar_entendimiento` y **no** propones cambios en ese turno.
- **Garantía en servidor:** si un turno trae `confirmar_entendimiento` y
  `propuesta_cambio`, se descartan los `propuesta_cambio` de ese turno (con motivo
  al log). Nunca dos preguntas a la vez. Vive en `componerTurno` o en el parseo,
  es pura y se prueba.
- Cada clic en la tarjeta se registra: `audit_log` `ai.centro_entendimiento`,
  `meta: { resultado: "seguir" | "alternativa" | "otra" }`, por una server action
  pequeña (`registrarEntendimiento`), con `after`/sin bloquear el envío del turno.

### 3. «No es esto» en las tarjetas de cambio

- `PropuestaCambio` gana un botón «No es esto» junto a Descartar.
- Llama a `descartarCambio(propuestaId, "malentendido")`: marca la propuesta
  `dismissed` y registra `audit_log` `ai.centro_entendimiento`
  `{ resultado: "malentendido", propuestaId, tabla, operacion }`.
- Después envía «No era eso» como turno nuevo para que el Centro pregunte.
  Para eso la tarjeta necesita poder enviar un turno: el contexto del agente
  (`ContextoDelAgente`) expone `enviar(texto)`.

### 4. Aprendizaje en la conversación

**Señal (ya existe casi toda):**
- `coach_proposals` con `origen = 'centro'`: aceptadas (`accepted`) y descartadas
  (`dismissed`), por `tipo` (y por `payload.tabla`/`payload.operacion` si
  `tipo = 'cambio'`).
- `audit_log` `ai.centro_escritura` con `meta.corregidos` (campos que la persona
  corrigió antes de guardar).
- `audit_log` `ai.centro_entendimiento` (confirmaciones y malentendidos).

**Resumen para el modelo** — función pura `resumirResultados(filas) → string[]`:
últimos 30 días, como mucho 12 líneas, agregadas y sin cifras de la persona más
allá de conteos («descartaste 3 bloques», «corregiste “Gramos” 2 veces», «dijiste
“No es esto” al mover tareas»). Entra en el prompt como sección «Cómo te fue con
mis propuestas». La carga (dos consultas con la sesión) vive junto a `pensar.ts`
y va en paralelo con `prepararCerebro`; si falla, la sección no sale.

**Bloque `recordar`:**

```json
{ "kind": "recordar", "datos": { "texto": "Prefiere registrar comidas en gramos", "ambito": "preference" } }
```

- `texto` 1–200 caracteres, sin marcado; `ambito` uno de `MEMORY_SCOPES`
  (`goal, project, finance, decision, preference, time, habit, health`).
- No tiene sección propia: el prompt pide que, si recuerda algo, lo diga en una
  frase del texto («Lo tendré en cuenta: …»). Así la persona siempre se entera en
  el momento, sin un componente nuevo.
- Se guarda en `memory_items` **sin preguntar**, con `origin = 'centro'` y
  `valid_until = hoy + 90 días`.
- Topes: 1 `recordar` por turno; 20 memorias `centro` activas por persona (al
  pasar de 20 se borra la más vieja de origen `centro`); no se duplica un texto
  igual (comparación normalizada: minúsculas, sin acentos, espacios colapsados).
- **D-204 — rompe D-089 a propósito, por decisión de la persona.** Para que sea
  honesto:
  - Migración **0079**: `memory_items.origin` admite `'centro'`.
  - `/intelligence/memory` marca esas memorias «Lo notó el Centro» y se borran como
    cualquier otra.
  - En el contexto del modelo (`textoDelContexto`), las de origen `centro` van en
    una sección aparte: «Lo que el Centro ha notado (puede equivocarse)», nunca
    mezcladas con «Lo que el usuario te ha dicho y debes respetar».
  - `recordar` solo en el Centro. El chat y los demás agentes no escriben memoria
    sin clic.

### 5. Chips de capacidades al abrir

- Catálogo puro `CAPACIDADES_VISIBLES`: `{ id, dominio, texto, franja? }`, con
  franja `manana | tarde | noche` opcional. Solo lo que el Centro sabe hacer hoy:
  tareas, notas, comidas (D-203), inversiones, mercado, «hoy» y búsqueda.
- `elegirChips({ catalogo, dominios, franja, usos })`, pura: filtra por dominios
  activos y franja, ordena por usos de los últimos 30 días (desc) y luego por el
  orden del catálogo, devuelve 4–6.
- Los usos salen de `audit_log` `ai.centro_chip` `{ id }`, registrado al pulsar.
- Se calculan en el servidor al abrir el Centro (donde hoy se carga «Hoy») y se
  pintan solo con el hilo vacío. Pulsar un chip lo envía como pregunta.
- Si falla el cálculo, no se pinta la fila.

## Errores

| Caso | La persona ve | Log |
|---|---|---|
| `confirmar_entendimiento` o `recordar` mal formado | Nada de ese bloque; el turno sigue | `bloque descartado: <motivo>` |
| Confirmación + propuestas en el mismo turno | Solo la confirmación | `propuestas descartadas: el turno pregunta primero` |
| `recordar` duplicado, sobre tope o error de base | Nada | `[centro-agente] recordar: <motivo>` |
| Falla la carga de resultados | Nada (el prompt va sin esa sección) | `[centro-agente] resultados: <motivo>` |
| Falla el cálculo de chips | Sin fila de chips | `[centro-agente] chips: <motivo>` |
| Falla el registro de un clic (entendimiento, chip) | Nada; el turno se envía igual | log |

## Pruebas

- **Dominio** (`node --test`, `tests/domain/`): parseo de `confirmar_entendimiento`
  y `recordar` (límites, marcado, ámbito); el filtro confirmación ⇒ sin propuestas;
  `resumirResultados` con filas de ejemplo (agrega, topa en 12, sin cifras de la
  persona); `elegirChips` (dominios, franja, orden por uso, 4–6); saneado de
  `recordar` (normalización para duplicados, tope de 20); el prompt nombra los
  bloques nuevos y separa «lo que el Centro ha notado».
- **pgTAP**: 0079 (`origin = 'centro'` admitido, los anteriores siguen, RLS igual).
- **Navegador** (Chromium local, modelo simulado con respuestas fijas): chips con
  hilo vacío, tarjeta de confirmación y sus botones, «No es esto», memoria visible
  en `/intelligence/memory`. **El modelo real no se prueba en local** (sin
  `GEMINI_API_KEY`).

## Fuera de alcance

- Ánimo y apoyo con el perfil psicológico: subproyecto **D**.
- Resto de tablas y acciones de módulo: subproyecto **B**.
- Journal: subproyecto **C**.
- Columna más ancha, hoja «¿Qué puedo hacer?», chips tras cada respuesta: no se
  pidieron.
- Proceso nocturno de aprendizaje.
