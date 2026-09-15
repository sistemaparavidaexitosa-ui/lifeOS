# Rutinas → Sistema de Identidad — diseño (en quién te estás convirtiendo)

**Fecha:** 2026-09-15 · **Estado:** diseño aprobado. Cada fase lleva su plan en `docs/superpowers/plans/`.

## Contexto

Hoy `/development/routines` es una lista de casillas:
- rutinas → hábitos;
- un toque que inserta o borra una fila `habit_logs(habit_id, log_date)`;
- una racha ingenua (`habitStreak`);
- un chip de adherencia a 30 días.

La única idea de identidad es el texto libre `routines.identity` (0046). No hay visión,
valores, diario, ánimo, energía, sueño, gráficas ni analítica de largo plazo. El plan del
*scorecard* (2026-08-24) nunca se construyó y su modelo de datos quedó obsoleto con 0046.

**Objetivo:** medir **en quién se está convirtiendo** la persona, no cuántas casillas marca.
La pantalla contesta una pregunta: *¿qué tan alineadas están tus acciones diarias con la
persona que quieres ser?*

Para eso hacen falta cinco piezas:
1. una identidad estructurada: perfil, rasgos y hábitos que «votan» por un rasgo;
2. un registro de hábitos más rico y permanente;
3. un motor de analítica puro;
4. un Identity Score determinista;
5. IA que narra y motiva **encima** de lo anterior.

**Decisiones del usuario (2026-09-15):**
- **Gráficas:** con Recharts. Se rompe D-008 a propósito y queda escrito en D-158.
- **Ánimo, energía y sueño:** van en un check-in diario. Cada registro de hábito puede
  llevar además nota, ánimo y energía desde una hoja de detalle. Marcar sigue siendo un toque.
- **Pantalla:** `/development/routines` tiene dos pestañas, **Hoy** y **Analítica**.
- **Entrega:** una rama y un PR por fase. Las migraciones van a la nube antes que el código.

## Invariantes

1. **El modelo no calcula.** Toda cifra sale de funciones puras en `src/lib/domain/**`,
   probadas con `node --test`. El modelo narra y cita `factId`.
2. **Nada se aplica sin aprobación (D-089).** El brief diario es *contenido*, no una
   acción. Lo que cambiaría datos pasa por `recommendations` o `coach_proposals` con un clic.
3. **`buildContext`, `TABLAS_CONSULTABLES` y `profiles.ai_domains` siguen siendo la
   puerta de privacidad.** El texto que escribe la persona (reflexiones, notas) entra en
   el prompt delimitado y marcado como no confiable.
4. **Un solo proveedor** (Gemini por `fetch`, D-087), sin embeddings. La única dependencia
   nueva es `recharts` (D-158).
5. **Se mantiene D-148:** registros, reflexiones, briefs y puntuaciones son eventos, no
   nodos. Los rasgos de identidad sí son nodos, porque la gente se refiere a ellos.
6. **Se extiende, no se sustituye:**
   - los insights viven en `recommendations`, no en una tabla `ai_insights`;
   - la memoria de IA no se escribe sola (D-096).
7. **Las citas son originales.** Se inspiran en principios de Napoleon Hill, Neville
   Goddard, James Clear y Robin Sharma. Nunca copian texto ni se atribuyen a un autor.

## Lo que NO se crea, y por qué

- **`habit_statistics` y `streaks`.** Son datos derivados. Se calculan con funciones puras
  a partir de una RPC que devuelve series en arreglos (lo que esquiva `max_rows = 1000`).
  Guardarlos obligaría a un proceso que los mantenga al día y abriría la puerta a que
  diverjan del registro (D-162).
- **`ai_insights`.** Ya existen `recommendations`, su máquina de estados, el *fingerprint*
  y `InsightSection`.
- **`visualizations` y `motivation_history`.** La visualización, la cita y las reacciones
  viven en la fila del brief del día.

## Arquitectura

```
UI (Server Components + islas cliente; Recharts solo en /analytics)
   │ Server Actions (zod, ActionResult)                │ Suspense
Cargadores  src/lib/data/{habit-analytics,identity}.ts  (server-only, cache())
   │ RPC habit_log_series (arreglos por hábito)
Dominio     src/lib/domain/development/habit-analytics.ts   rachas, periodos, KPIs, series
            src/lib/domain/identity/{score,brief}.ts          Identity Score, anti-repetición
            src/lib/domain/insights/facts/{habit-patterns,identity}.ts
   │ Fact[] → buildContext
IA          src/lib/identity/generar.ts                 brief diario, bajo demanda
            src/lib/insights/generar-recomendaciones.ts núcleo de analyze (sesión y cron)
Reloj       /api/push/dispatch → despacharIdentidad (foto del score, sin modelo)
                                → despacharInsightsHabitos (nocturno, con modelo, con guarda)
```

## Definiciones de métricas (v1, `habit-analytics.ts`)

### Estados del registro (D-159)

- **`completed`:** lleva `completion_pct` entre 1 y 100.
- **`skipped` (omitido):** pct 0 y rompe la racha.
- **`postponed` (sin oportunidad):** pct 0, es neutro para la racha y sale del denominador.

### Rachas y cumplimiento

- **Días que tocan:** fechas en que `routineDueToday(frecuencia, d)` es verdadero y el hábito
  ya existía. La frecuencia es la actual; se acepta que la historia no está versionada.
- **Racha:** se recorren hacia atrás los días que tocan.
  - completado → +1
  - pospuesto → se salta
  - omitido o sin registro → se corta
  - hoy sin registro no corta
  - un hábito semanal cuenta semanas
  - **racha máxima:** el mismo recorrido sobre toda la ventana de la serie
- **Cumplimiento de un periodo** (día, semana ISO, mes, trimestre, año; zona horaria del
  usuario): Σ `completion_pct` / (100 × (días que tocan − pospuestos)).

### Por hábito

- **Consistencia:** 0,7 × cumplimiento a 30 días + 0,3 × cumplimiento a 90 días. Los
  últimos 7 días pesan el doble.
- **Rankings:** los mejores se ordenan por cumplimiento a 30 días; los más omitidos, por
  omitidos más días que tocaban sin registro.

### KPIs

- **Días sólidos:** días seguidos que tocaban con al menos el 80% de sus hábitos hechos.
- **Tasa de éxito:** completados / (completados + omitidos + sin registro).
- **Índice de disciplina:** % de los últimos 30 días que tocaban que fueron sólidos.
- **Momentum:** cumplimiento a 7 días − cumplimiento a 30 días, en puntos con signo.
- **Tendencia mensual:** últimos 30 días contra los 30 anteriores.

## Identity Score v1 (`src/lib/domain/identity/score.ts`, `formula_version = 1`, D-160)

Va de 0 a 100: es la media ponderada de los componentes que existan.
- Si falta un componente, los pesos restantes se renormalizan.
- Sin hábitos, el score es `null`.

| Componente | Peso | Definición |
|---|---|---|
| Votos por tu identidad | 25 | Media, por rasgo activo, del cumplimiento a 30 días de sus hábitos vinculados |
| Constancia de hábitos | 25 | Cumplimiento a 30 días de todos los hábitos que tocan, con peso por recencia |
| Equilibrio de áreas | 15 | Media del cumplimiento por área de vida presente: un área fuerte no tapa una descuidada. Alimenta el radar. |
| Avance de metas | 15 | Media, en metas activas, de min(100, avance ÷ ritmo esperado × 100) |
| Adherencia a rutinas | 10 | Media de `routineAdherence` de las rutinas activas |
| Reflexión | 10 | Días de los últimos 14 con check-in, reflexión o `logbook` de tipo `learning`, ÷ 14 |

- Devuelve también `components`, para que la pantalla explique el número.
- Cada noche se guarda una foto en `identity_scores`; el valor de hoy se calcula al pintar.
- **Área de un hábito:** manda la del rasgo. Si no hay rasgo, se usa `habits.category`:
  Salud→Salud, Aprendizaje→Aprendizaje, Trabajo→Carrera, Personal/Otros→Personal.

## Base de datos

- Una migración por fase, con el siguiente número libre en el momento de construirla.
- Los números 0063–0065 del spec del sistema cognitivo eran provisionales. Esas fases
  tomarán el número libre cuando se construyan.

**Convenciones de cada migración:**
- encabezado en español;
- `comment on` en tablas y columnas;
- RLS `user_id = auth.uid()`, y `exists` sobre el padre en las tablas hijas;
- `grant` explícitos;
- trigger guardián `security definer` para las FK entre dueños;
- archivo pgTAP propio.

### F1 · `registro_de_habitos`

- **`habit_logs` gana columnas:**
  - `status` (`completed | skipped | postponed`, por defecto `completed`)
  - `completion_pct smallint` 0..100, por defecto 100
  - check `(status = 'completed') = (completion_pct > 0)`
  - `note` (≤ 500)
  - `mood` y `energy`, 1..5, opcionales
  - `updated_at`
  - `completed_at` se conserva como «cuándo se registró»
- **`daily_reflections`:**
  - `user_id`, `local_date`
  - `mood` y `energy` 1..5, `sleep_hours numeric(3,1)` 0..24
  - `reflection_prompt`, `reflection` (≤ 2000), `wins` (≤ 1000)
  - `unique(user_id, local_date)`
- **`habit_log_series(p_from, p_to)`:** `security invoker`, una fila por hábito, con
  arreglos de fechas, estados, pct, ánimo y energía.
- **`habit_log_series_de(p_uid, p_from, p_to)`:** `security definer`, ejecutable solo por
  `service_role`.

### F3 · `identidad`

- **`identity_profiles`:**
  - `user_id` como clave primaria
  - `desired_identity` (≤ 280), `vision_statement` (≤ 2000)
  - `core_values text[]`, 10 como máximo
  - `motivational_tone` (`sereno | directo | intenso`)
  - `inspirations text[]`
- **`identity_revisions`:** la llena un trigger cuando cambian la identidad, la visión o
  los valores.
- **`identity_traits`:**
  - `name` (≤ 60), `statement` (≤ 160)
  - `area` con el mismo check que `personal_goals.area`
  - `position`, `active`
- **`habit_identity_traits`:** tabla puente con trigger guardián de mismo dueño.
- **`identity_scores`:**
  - `(user_id, local_date)` como clave primaria
  - `score`, `components jsonb`, `formula_version`
  - el usuario solo lee; escribe `service_role`
- **Grafo:**
  - tipo de nodo `identidad`, con fila en `graph_sources` para `identity_traits`
  - regla de arista `habit_identity_traits` → `supports`, con `anchor_column = 'habit_id'`

### F4 · `coach_de_identidad`

- **`identity_briefs`** (`unique(user_id, local_date)`):
  - `affirmations jsonb` (5), `visualization jsonb` (2–4 min, con pasos)
  - `identity_reminder`, `reflection_question`
  - `quote jsonb` (`{text, principle}`)
  - `fact_ids`, `model`, `prompt_version`
  - `generation` (≤ 3)
  - `reactions jsonb`: lo único que el usuario puede actualizar (`grant update (reactions)`)

### F5 · `insights_nocturnos`

- **`ai_job_runs`:**
  - `(user_id, job, local_date)` como clave primaria, más `facts_hash`
  - solo `service_role`
  - es la guarda de un intento por día, para que el reloj de 5 minutos no llame al modelo 36 veces

### Registros

- **`TABLAS_CONSULTABLES`:**
  - `habit_logs` suma `status, completion_pct, note, mood, energy`
  - entran `daily_reflections`, `identity_profiles` e `identity_traits` (growth)
  - entra `identity_scores` (habits)
- **«Borrar historial de IA»** (D-092) también borra `identity_briefs`.

## Server Actions, RPC y reloj

### Hábitos (`routines/actions.ts`)

- **`toggleHabitToday`** pasa a mirar el estado y devuelve `ActionResult`:
  - completado → borra
  - omitido o pospuesto → pasa a completado
  - sin fila → inserta
- **`logHabit({habitId, date, status, completionPct, note, mood, energy})`:**
  - acepta hasta 7 días atrás
  - hace upsert sobre `(habit_id, log_date)`
  - deja rastro `habit.log`
- **`saveDailyReflection`:** upsert del check-in del día.

### Identidad (`src/lib/identity/actions.ts`)

- `upsertIdentityProfile`, `upsertTrait`, `deleteTrait`
- `generateTodayBrief` (idempotente), `regenerateTodayBrief` (≤ 3), `reactToBriefItem`
- `upsertHabit` recibe `traitIds[]`

### Análisis

- `analyze(scope)` conserva su firma. Su cuerpo pasa a
  `generarRecomendaciones({supabase, userId, scope, today, modo, overrides})`.

### Lectores de `habit_logs` que pasan a filtrar `status = 'completed'`

- `lib/data/development.ts`
- `insights/facts-loader.ts`
- `development/page.tsx`
- `routines/page.tsx`
- la sincronización de `routine_runs`

Además, el upsert de `nutrition/actions.ts` no debe dejar una fila omitida con un pct incoherente.

### Reloj (`/api/push/dispatch`)

- **`despacharIdentidad`:** a la hora de la noche, sin modelo, hace upsert en `identity_scores`.
- **`despacharInsightsHabitos`:**
  - a la hora de la noche, solo con `coach_enabled`
  - pasa por la guarda `ai_job_runs` y no llama al modelo si `facts_hash` no cambió
  - lotes de 5, y solo si quedan al menos 20 s de presupuesto

## Flujo de IA

### Brief diario (bajo demanda)

1. Hoy pinta `IdentityBriefSection` dentro de `Suspense`. Si ya hay fila del día, la
   muestra. Si no, `BriefGenerator` llama a `generateTodayBrief()`.
2. `generar.ts` exige que `growth` y `habits` estén encendidos. Si no, devuelve un motivo
   legible.
3. **Carga del contexto:**
   - perfil, rasgos con su consistencia y la última revisión;
   - metas activas con avance y rutinas con su `identity`;
   - hechos de logro (`facts/identity.ts`), `habitsFacts` y `growthFacts`;
   - reflexiones y aprendizajes de 7 días, delimitados como texto no confiable;
   - los últimos 14 briefs con sus reacciones;
   - `memory_items` de hábitos, metas y preferencias.
4. **Contexto:** `buildContext({scope: 'global', maxFacts: 60})`, con un bloque IDENTIDAD en el prompt.
5. **Llamada:** `generateJson` con `BRIEF_BUDGET`, un esquema zod con su espejo en Gemini y
   un prompt que pide:
   - hablar de su identidad, sus rasgos y sus hechos, con el tono que eligió;
   - destilar principios:
     - Hill: propósito definido;
     - Goddard: vivir el deseo cumplido;
     - Clear: cada acción es un voto, sistemas;
     - Sharma: mañanas, mejoras diarias;
   - no citar ni atribuir;
   - nada de motivación de póster;
   - citar `factIds`.
6. **Saneado puro** (`brief.ts`):
   - recorta longitudes y deja solo `factIds` conocidos;
   - descarta afirmaciones con Jaccard de tokens normalizados ≥ 0,6 frente a las de los
     últimos 30 días;
   - si quedan menos de 5, hace una ronda más con las rechazadas; acepta desde 3, y si no
     llega, `{ok: false}`;
   - rechaza citas que se atribuyan a un autor.
7. **Guardado:** inserta `identity_briefs` y deja rastro `ai.identity_brief` en `audit_log`.

### Memoria de IA (sin escribirla sola)

| Qué se recuerda | Dónde vive |
|---|---|
| Afirmaciones previas y reacciones | `identity_briefs` |
| Reflexiones recientes | `daily_reflections` y `logbook` |
| Cambios de identidad | `identity_revisions` |
| Evolución de hábitos | componentes y tendencia del score |
| Metas | `personal_goals` |
| Preferencias motivacionales | tono e inspiraciones elegidos, reacciones y `memory_items` de preferencia |

### Insights nocturnos

1. `generarRecomendaciones(modo: 'servicio', scope: 'habits')` corre desde el reloj.
2. Un extractor puro, `facts/habit-patterns.ts`, es el tramo de hábitos de la Fase A3 del
   sistema cognitivo y añade `Fact.kind` (A1).
   - **Umbrales:** al menos 6 semanas de datos, y |r| ≥ 0,5 o una brecha ≥ 15 puntos.
   - **Redacción:** habla de asociación, nunca de causa.
   - **Hechos que produce:**
     - cumplimiento por rutina;
     - bajón por día de la semana;
     - hábito que acompaña a los demás (*lift*);
     - hábito clave (phi con el cumplimiento del día);
     - cumplimiento con menos de 6 h de sueño o energía ≤ 2;
     - caída de momentum;
     - el hábito más omitido.
3. `recommend` escribe `recommendations` con `domain = 'habits'`, deduplicadas por *fingerprint*.
4. Hoy y `/development` las muestran con `<InsightSection scope="habits"/>`.

## Árbol de componentes

```
development/routines/layout.tsx         encabezado + RoutineTabs (Hoy | Analítica)
development/routines/page.tsx — HOY
├ IdentityHero (S)          identidad, rasgos, recordatorio · IdentityProfileSheet (C)
├ IdentityScoreCard (S)     anillo cónico + Δ7d + barras por componente
├ TodayStats (S)            Stat × 3: Hoy % · Días sólidos · Semana %
├ Suspense → IdentityBriefSection (S)
│   ├ AffirmationList (C) · VisualizationCard (C) · pregunta · cita
│   └ BriefGenerator (C)
├ TodayRoutines (S)         RoutineCard → RoutineRunner → HabitRow → HabitLogSheet (C)
├ DailyCheckinCard (C)      ánimo · energía · sueño · reflexión · logros
├ Suspense → InsightSection scope="habits"
└ ManageRoutines (S)        plantillas, RoutineForm, TraitManager, otras rutinas
development/routines/analytics/page.tsx — ANALÍTICA  (?rango=7|30|90|365)
├ RangePicker · KpiGrid (MetricCard × 8)
├ CompletionCurve (Area) · WeeklyTrend (Bar)
├ MonthlyHeatmap (rejilla CSS) · StreakTimeline
├ LifeAreasRadar (Radar) · IdentityEvolution (Line)
└ HabitTable
```

## Hoja de ruta

| Fase | Rama | Entrega |
|---|---|---|
| F0 | `docs/identidad-y-analitica` | Este spec |
| F1 | `feat/rutinas-registro-rico` | Migración F1, RPC de series, rachas y periodos, toggle con estados, `logHabit`, `HabitLogSheet`, check-in diario |
| F2 | `feat/rutinas-analitica` | `recharts` (D-158), pestañas, KPIs y series, página Analítica |
| F3 | `feat/identidad` | Migración F3, `score.ts`, UI de identidad, foto nocturna del score, evolución y radar |
| F4 | `feat/coach-de-identidad` | Migración F4, brief diario completo |
| F5 | `feat/insights-nocturnos` | Migración F5, `habit-patterns.ts`, `generarRecomendaciones`, despacho nocturno |
| F6 | `feat/rutinas-hoy-premium` | Composición final de Hoy, estados vacíos, móvil, modo oscuro, accesibilidad |

Las ramas se apilan: cada una sale de la anterior y su PR apunta a ella.

## Decisiones previstas

Se escriben en `docs/DECISIONS.md` en la fase que las implementa:

| ID | Decisión | Fase |
|---|---|---|
| D-158 | Recharts | F2 |
| D-159 | Estados de `habit_logs` y reglas de racha | F1 |
| D-160 | Identity Score v1 | F3 |
| D-161 | El brief es contenido; las citas nunca se atribuyen | F4 |
| D-162 | Analítica derivada, sin tablas de estadísticas | F1 |
| D-163 | `ai_job_runs` e insights nocturnos | F5 |

## Riesgos

- **Cambiar el significado de `habit_logs`:** hay que tocar cada lector y probarlo en pgTAP.
- **`max_rows`:** usar la RPC de arreglos.
- **Los 60 s del reloj:** vigilar el tiempo y usar la guarda por día.
- **Recharts con React 19 y la CSP con nonce:** verificar con `pnpm build && pnpm start`,
  no con `pnpm dev`.
- **Cuota de Gemini:** el brief es bajo demanda y tiene un máximo de 3 generaciones al día.

## Verificación

- **Por fase:** `pnpm typecheck && pnpm lint && pnpm test:unit` y `supabase test db`.
  La migración local se aplica con `supabase migration up`, sin `db reset`.
- **En navegador:** `pnpm build && pnpm start` con Playwright, en claro y oscuro y a 400 px.
- **IA** (necesita `GEMINI_API_KEY`):
  - dos llamadas devuelven la misma fila;
  - la regeneración para en 3;
  - con `growth` apagado sale el motivo;
  - queda rastro en `audit_log`.
- **Reloj:** una llamada deja una fila en `identity_scores` y otra en `ai_job_runs`; la
  segunda llamada no invoca el modelo.
