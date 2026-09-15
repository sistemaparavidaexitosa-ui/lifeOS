# F3 · Identidad e Identity Score · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la persona declare quién quiere ser (perfil y rasgos), que cada hábito vote por uno o varios rasgos, y que el Identity Score mida la alineación entre acciones e identidad, con una foto cada noche para ver la evolución.

**Architecture:** migración `0064_identidad.sql` (perfil, revisiones por trigger, rasgos, votos con guard, puntuaciones solo-servidor, nodo y arista en el grafo); dominio puro `src/lib/domain/identity/score.ts`; una sola carga de entradas (`src/lib/identity/score-inputs.ts`) que sirve a la pantalla con sesión y al reloj sin ella; UI en Hoy, Analítica y el panel de Desarrollo.

**Tech Stack:** Supabase Postgres (plpgsql, pgTAP, registro del grafo), Next.js 15 Server Actions, TypeScript con `node --test`, Recharts (D-158).

**Spec:** `docs/superpowers/specs/2026-09-15-identidad-y-analitica-design.md` (§ Identity Score v1, § F3).

## Global Constraints

- El Identity Score no llama al modelo. Toda cifra en `score.ts`, con pruebas.
- Lo que corre sin sesión filtra por `user_id` en cada consulta (regla de `src/lib/coach/facts.ts`); la serie sale de `habit_log_series_de`.
- `identity_scores` no admite escritura de `authenticated`.
- Un rasgo es nodo del grafo (D-148 lo permite); registros, puntuaciones y revisiones no.
- Español en UI, comentarios y commits.

## Tareas

### Task 1: Migración 0064 y pgTAP 0037
- [x] Tablas, trigger de revisiones (`security definer`, ignora el primer rellenado), guard de votos, RLS y grants.
- [x] Grafo: tipo `identity_trait` (posición 45), fuente `identity_traits`, regla puente `habit_identity_traits` → `supports` con `anchor_column = habit_id`; cierre con `graph_registry_diff`, `graph_registry_deriva` y `graph_edges_deriva`.
- [x] pgTAP: checks de tono/inspiraciones/área, revisión solo al cambiar identidad, voto por rasgo ajeno rechazado, puntuación no escribible, nodo y arista creados y borrados, aislamiento entre usuarios.
- [x] `pnpm gen:types:local`, `RADIO.identity_trait` y color en `graph-catalog.test.ts`; entradas en `TABLAS_CONSULTABLES`.

### Task 2: `score.ts` (TDD)
- [x] `identityScore(inputs)` con los seis componentes de D-160, renormalización y `null` sin constancia.
- [x] `resolveHabitAreas(habits, traits, votes)`.
- [x] Refactor sin duplicar reglas: `goalExpectedPct` sale de `goalAtRisk`; `recencyWeightedRate` se exporta de `habit-dashboard.ts`.

### Task 3: Carga única y acciones
- [x] `loadScoreContext({supabase, userId, today, timeZone, modo, sources})` en `src/lib/identity/score-inputs.ts`.
- [x] `loadIdentityOverview()` (sesión): perfil, rasgos, votos, puntuación de hoy, delta frente a la foto de hace ≥ 7 días, historial y sugerencias desde `routines.identity`.
- [x] `upsertIdentityProfile`, `upsertTrait`, `deleteTrait` con `ActionResult`; `upsertHabit` reemplaza votos solo si llega `traitsPresent`.

### Task 4: UI
- [x] Hoy: `IdentityHero` (invitación sin perfil; con perfil, identidad, valores y rasgos) e `IdentityScoreCard` (anillo, delta y desglose).
- [x] `HabitForm`: casillas «¿Por quién vota este hábito?».
- [x] Analítica: indicador Identity Score, `IdentityEvolution` y radar con el área del rasgo.
- [x] `/development`: tarjeta del Identity Score enlazada a Analítica.

### Task 5: Foto nocturna
- [x] `tocaFotoDeIdentidad(hora)` (23 h local) con prueba.
- [x] `despacharIdentidad` en `/api/push/dispatch`: lote de 20, presupuesto de 45 s, idempotente por (user_id, local_date), sin modelo.

### Task 6: Verificación, D-160 y PR
- [x] `pnpm typecheck && pnpm lint && pnpm test:unit`, `supabase test db`, `pnpm build`.
- [x] Reloj: dos llamadas con la zona en 23 h → una sola foto.
- [x] Navegador: definir identidad desde una sugerencia, crear rasgo, vincular un hábito, ver el componente de votos, la evolución y la tarjeta del panel.
- [x] D-160 y PR con base `feat/rutinas-analitica`.
