# El Centro escribe en toda la app, lee lo que la IA ya recomendó y usa internet

Fecha: 2026-09-25 · Rama: `feat/centro-escritura` · Decisiones: D-203 en adelante · Migración: 0078

## Por qué

La persona pidió «expandir al máximo la capacidad agéntica y generativa del
Centro, para todas las tablas de Supabase», y después amplió: que el Centro
tome las recomendaciones que la IA ya genera y que tenga acceso a internet.

Estado de partida (verificado en el código, 2026-09-25):

- **Lectura:** casi cubierta. `TABLAS_CONSULTABLES` (`src/lib/insights/context.ts`)
  abre 55 tablas a `consultar`/`buscar`/`leer_hechos`/`explorar_grafo`, filtradas
  por `profiles.ai_domains` y con la RLS de la sesión.
- **Escritura:** casi nada. El Centro solo propone `foco`/`tarea`/`bloque`
  (vía `coach_proposals`) y `propuesta_movimiento` (D-202). Ninguna otra tabla.
- **Recomendaciones de IA:** `recommendations`, `coach_proposals`,
  `identity_briefs` y `memory_items` no están en la lista blanca de lectura: el
  Centro no las ve.
- **Internet:** `buscar_en_internet` ya está en la caja de herramientas del
  Centro y se audita, pero su resultado no puede aparecer en la interfaz (los
  bloques solo se anclan a filas) y no hay forma de leer una página.

## Qué decidió la persona

| Pregunta | Respuesta |
|---|---|
| Qué es «capacidad máxima» | Escribir en todas las tablas de usuario, **siempre con Guardar** (nunca solo). |
| Qué operaciones | Crear, editar **y borrar**. |
| Enfoque | **A**: un bloque genérico `propuesta_cambio` + un registro de escritura por tabla que reutiliza las server actions existentes. Se descartó B (un bloque por dominio: no escala) y C (SQL genérico por RPC: se salta validaciones y efectos). |
| Ampliación | Las recomendaciones de IA existentes como material del Centro, e internet «de verdad» en la interfaz. |

## Alcance

### 1. Escritura con Guardar

**Tablas escribibles (registro `ESCRITURA_POR_TABLA`):**

- **money:** `accounts`, `categories`, `journal_entries` (con sus `journal_lines`:
  un gasto/ingreso es UNA propuesta), `budgets`, `savings_goals`,
  `financial_goals`, `investments`, `assets`, `liabilities`, `cashback_cards`,
  `cashback_redemptions`, `family_members`, `watchlist`.
  `investment_movements` sigue por su bloque propio (`propuesta_movimiento`).
- **debt:** `debts`
- **habits / growth (identidad):** `habits`, `habit_logs`, `routines`,
  `identity_traits`, `habit_identity_traits`, `identity_profiles`, `daily_reflections`
- **time:** `occupations`
- **execution:** `tasks`, `projects`, `task_groups`, `task_assignees`,
  `daily_plans`, `logbook`, `reminders`, `notebooks`, `notes`, `folders`,
  `knowledge_items`, `comments`
- **growth:** `personal_goals`, `key_results`, `books`, `book_notes`,
  `book_progress`, `reading_plan_weeks`
- **nutrition:** `nutrition_profiles`, `food_entries`, `foods`, `body_measurements`
- **memoria:** `memory_items` («¿quieres que recuerde que…?» / olvidar)

El dominio de cada tabla es el de `TABLAS_CONSULTABLES` cuando existe allí.
Las que no están (`watchlist`, `foods`, `task_assignees`, `memory_items`) se
asignan en el registro y, si el plan descubre que alguna no encaja en un
dominio existente, se decide en su D-xxx, no se adivina.

**Prohibidas (el test de cobertura lo impide):** `profiles` (ahí vive
`ai_domains`: el agente jamás amplía sus propios permisos); `workspaces`,
`memberships`, `invitations`, `project_shares`; `audit_log`, `consents`,
`graph_*`; derivadas (`identity_scores`, `identity_briefs`, `identity_revisions`,
`net_worth_snapshots`, `task_history`, `workspace_activity`); colas y
ejecuciones (`*_runs`, `notifications`, `push_subscriptions`, `ai_*`,
`coach_proposals`, `centro_runs`, `nav_visitas`, `comment_reads`,
`template_catalog`, `recommendations`, `ritual_policy`, `ritual_prefs`,
`notification_prefs`, `automations`, `task_files`).

**Barreras (no se rodean):**

1. `ai_domains` manda también en la escritura: tabla de dominio apagado no se
   propone ni se confirma.
2. Editar o borrar solo sobre filas **leídas en el turno** (`filasEntregadas()`).
   El «antes» del diff sale de la fila leída, no del modelo.
3. Todo se guarda con la sesión (RLS) y por la server action existente de la
   sección. Nunca `createAdminClient()`.
4. Lo que se confirma es lo que el servidor validó: al confirmar se vuelve a
   validar la propuesta guardada contra el registro; el navegador solo manda un
   `propuestaId` y, opcionalmente, correcciones que pasan el mismo zod.
5. Auditoría: cada escritura confirmada deja `audit_log` `ai.centro_escritura`
   `{ tabla, operacion, id, propuestaId }`.
6. Borrar: la tarjeta enseña la fila entera y un botón rojo separado. Nunca en
   masa.

### 2. Recomendaciones de IA como material del Centro

- **Leer:** `recommendations`, `coach_proposals`, `identity_briefs` y
  `memory_items` entran en `TABLAS_CONSULTABLES`, cada una en su dominio.
  (`memory_items` ya llega al contexto; entrar en la lista lo hace citable.)
- **Actuar con un clic** (bloque `acciones_recomendacion`), por las acciones
  existentes: `setRecommendationStatus`, `editRecommendationText`,
  `acceptProposal`, `dismissProposal`, y marcar hecha la acción del brief.
- **Convertir en cambio:** una recomendación accionable se vuelve
  `propuesta_cambio` con `origen_recomendacion: <id>` en el payload; al
  confirmar el cambio, la recomendación pasa a aceptada.
- El CONTENIDO de `recommendations` e `identity_briefs` no se reescribe desde el
  Centro; solo su estado.

### 3. Internet en la interfaz

- **Resultados citables:** `buscar_en_internet` devuelve sus fuentes con id
  `web:<n>` (título, url, fragmento), registradas como las filas del turno.
- **Bloque `fuentes`:** enlaces a `web:<n>` leídos en el turno. Regla de oro
  intacta: una cifra del mundo va en el texto y con fuente, nunca como dato
  de la persona.
- **Herramienta `leer_pagina(url)`:** solo URLs salidas de una búsqueda del
  turno o pegadas por la persona en su mensaje. Solo texto, recorte a ~6000
  caracteres, timeout, sin seguir a hosts privados (loopback, rangos
  internos, metadatos de la nube).
- **Web + escritura:** «añade *Atomic Habits* a mis libros» → busca → esquema →
  `propuesta_cambio` sobre `books` con `fuentes: ["web:<n>"]` visible en la tarjeta.
- **Privacidad:** se mantiene la regla de `ESQUEMA_BUSQUEDA` (ni cifras ni
  nombres de la persona en la consulta). Cada búsqueda y cada página leída van a
  `audit_log`. Nuevo interruptor en Configuración → IA, «Permitir internet»,
  **encendido por defecto** (hoy ya lo está); apagado quita `buscar_en_internet`
  y `leer_pagina` de la caja. Dónde vive el interruptor se decide en el plan
  sin tocar la escritura de `profiles` por el agente (barrera 1).

## Contrato

Bloque nuevo en `KINDS_DEL_AGENTE` (mismo sobre `{ kind, datos: "<JSON>" }`):

```json
{ "kind": "propuesta_cambio", "datos": {
  "cambios": [
    { "operacion": "crear",  "tabla": "food_entries", "campos": { "name": "Avena", "grams": 80, "meal": "desayuno" } },
    { "operacion": "editar", "fila": "fila:tasks:<uuid>", "campos": { "status": "done" } },
    { "operacion": "borrar", "fila": "fila:reminders:<uuid>" }
  ],
  "fuentes": ["web:2"],
  "origen_recomendacion": null
}}
```

- 1–5 cambios por bloque; máximo 10 cambios por turno.
- En `editar`/`borrar` la tabla sale de la `fila`, no se declara aparte.
- Como el `monto` de D-202, los `campos` SON valores del modelo: excepción
  explícita a la regla de oro, y por eso nunca se guardan sin Guardar.
- `rotuloConCifras` no aplica a `campos` (son valores, no rótulos).

Otros dos bloques: `acciones_recomendacion` `{ items: [{ fila, accion:
"aceptar"|"descartar"|"hecho" }] }` (1–5, filas de las tablas de
recomendaciones leídas en el turno) y `fuentes` `{ items: ["web:<n>"] }` (1–5).

## Piezas

1. **`ESCRITURA_POR_TABLA`** (dominio, puro): por tabla, dominio, operaciones
   permitidas, campos escribibles con zod, etiquetas legibles, campos a enseñar
   en la tarjeta. Campo fuera del registro = se descarta; `user_id`, `id`,
   `workspace_id` y similares nunca son escribibles.
2. **`ADAPTADORES`** (servidor): por tabla×operación, arma el `FormData` y llama
   a la server action existente (`logFoodEntry`, `upsertDebt`,
   `deleteFoodEntry`…). Sin acción adecuada → se añade una pequeña en su
   `actions.ts`; nunca un insert suelto desde el Centro. Acciones que hacen
   `redirect()` no sirven tal cual: el adaptador usa o extrae la variante sin
   redirect.
3. **`esquema_de_tabla(tabla)`** (herramienta): campos, tipos, obligatorios,
   enums y operaciones, desde el registro. Tabla no autorizada = misma
   respuesta que tabla inexistente.
4. **Tarjeta `PropuestaCambio`:** crear → campos; editar → antes → después;
   borrar → fila entera en rojo. Campos corregibles antes de guardar.
   Guardar / Descartar / «Guardar todo».
5. **`confirmarCambio(propuestaId, correcciones?)`** (una sola server action).

## Flujo

1. El turno valida cada cambio: tabla en el registro, dominio en `ai_domains`,
   fila leída si edita/borra, zod. Lo que no pasa se descarta con motivo al log.
2. Cada cambio válido se guarda en `coach_proposals` (`origen: "centro"`,
   `tipo: "cambio"`, payload validado). **Migración 0078**: añade `cambio` al
   check de `tipo` (patrón de 0071); RLS sin cambios. La tarjeta recibe solo
   los `propuestaId`.
3. `confirmarCambio`: lee la propuesta (RLS), exige `pending`, re-valida contra
   el registro y `ai_domains`, aplica correcciones (mismo zod), llama al
   adaptador, marca aceptada, audita. Para editar/borrar comprueba que la fila
   siga existiendo.
4. «Guardar todo» confirma uno a uno. **No es transaccional entre tablas**:
   cada cambio enseña su ✓ o su error.

Las propuestas no guardadas siguen como pendientes del coach si se cierra el
Centro; confirmar dos veces es imposible (ya no está `pending`).

## Prompt y topes

- **Índice corto en `SYSTEM_AGENTE`**, generado desde el registro: tablas
  escribibles por dominio con una línea cada una, y la regla «antes de proponer,
  `esquema_de_tabla`; para editar/borrar, lee la fila primero». Más una línea
  para recomendaciones y otra para internet/fuentes.
- **Rondas de herramientas:** `MAX_RONDAS_HERRAMIENTAS = 4` es global en
  `gemini-provider.ts`; pasa a ser una opción de `generateJson` con 4 por
  defecto, y el Centro pide 6.
- **Salida:** `CENTRO_AGENTE_BUDGET.maxOutputTokens` 3000 → 4000;
  `thinkingBudget` sigue en 256.
- **Web:** como mucho 3 búsquedas y 2 páginas por turno.
- **Respaldo Groq** (sin herramientas): no hay filas leídas → editar/borrar se
  descartan solos; crear pasa por Guardar. Sin caso especial.

## Errores

| Caso | La persona ve | Log |
|---|---|---|
| Tabla/campo fuera del registro, dominio apagado, fila no leída, zod | El cambio no aparece; el texto dice lo que sí se pudo | `[centro-agente] cambio descartado: <motivo>` |
| La server action rechaza al guardar | Su error en la tarjeta; la propuesta sigue pendiente | — |
| La fila cambió o se borró antes de Guardar | «Esta fila ya no existe o cambió; vuelve a pedírselo al Centro» | propuesta → descartada |
| Doble clic / dos pestañas | «Ya guardado» | — |
| Dominio apagado con propuestas pendientes | «Dominio no autorizado» | — |
| Web falla o expira | El turno sigue sin esa parte | `audit_log` del intento |
| `leer_pagina` con URL no autorizada | La herramienta se niega; el modelo lo explica | log |

## Pruebas

- **Dominio** (`node --test`, `tests/domain/`): parseo de los tres bloques;
  cada entrada del registro acepta un ejemplo válido y rechaza `user_id`/`id`;
  barrera de fila leída; topes; índice del prompt generado del registro;
  validación de URL de `leer_pagina`.
- **Test de cobertura del registro:** toda tabla escribible tiene adaptador por
  cada operación declarada; ninguna tabla prohibida (sobre todo `profiles`)
  está en el registro. Es el guardián del alcance.
- **pgTAP:** 0078 (tipo `cambio`, RLS igual).
- **Navegador** (Chromium local): proponer, corregir, guardar, descartar,
  doble confirmación, con un modelo de respuestas fijas. **El modelo real no se
  puede probar en local sin `GEMINI_API_KEY`**: se dice en el PR.

## Entregas (un spec, un plan, cuatro entregas)

1. **Núcleo:** registro, `propuesta_cambio`, `esquema_de_tabla`,
   `confirmarCambio`, 0078, tarjeta. Solo Ejecución y Nutrición (tareas, notas,
   comidas) para ver el camino entero.
2. **Resto de tablas** del registro, dominio por dominio (dinero, deudas,
   hábitos/identidad, crecimiento, tiempo, memoria).
3. **Recomendaciones:** lectura de las cuatro tablas, `acciones_recomendacion`,
   conversión recomendación → cambio.
4. **Internet:** ids `web:<n>`, bloque `fuentes`, `leer_pagina`, interruptor.

Todo detrás del flag actual del Centro agente (`AGENTIC_CENTER_RUNTIME`).

## Fuera de alcance

- Que el Centro escriba sin Guardar (se descartó explícitamente).
- Tarjetas a medida por dominio (enfoque B).
- Transacciones entre tablas en «Guardar todo».
- Escribir `profiles`, compartición, grafo o tablas derivadas.
