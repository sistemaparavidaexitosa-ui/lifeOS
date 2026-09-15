# F1 · Registro rico de hábitos y check-in diario · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cada registro de hábito guarde estado, porcentaje, nota, ánimo y energía; que las rachas respeten la frecuencia; y que exista un check-in diario con ánimo, energía, sueño y reflexión.

**Architecture:**
- Una migración (`0063_registro_de_habitos.sql`) amplía `habit_logs`, crea `daily_reflections` y añade la RPC `habit_log_series` para leer series sin chocar con `max_rows`.
- La matemática vive en un módulo puro nuevo, `habit-analytics.ts`, con ranuras por frecuencia y rachas.
- Las Server Actions de rutinas pasan a entender estados.
- La UI gana:
  - una hoja de detalle por hábito;
  - una tarjeta de check-in.

**Tech Stack:** Supabase Postgres (plpgsql, pgTAP), Next.js 15 Server Actions, TypeScript con `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-15-identidad-y-analitica-design.md` (§ F1, § Definiciones de métricas).

## Global Constraints

- Sin dependencias npm nuevas en esta fase.
- Toda cifra en `src/lib/domain/**`, sin `new Date()` implícito; los tests pasan una fecha fija.
- Los lectores de `habit_logs` que significan «hecho» filtran `status = 'completed'`.
- Las migraciones locales se aplican con `supabase migration up`, **nunca** `db reset` (hay datos locales).
- Código, comentarios, mensajes y commits en español. Los comentarios explican el porqué.
- Commits terminan con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0063_registro_de_habitos.sql` | Columnas de `habit_logs`, `daily_reflections`, RPC `habit_log_series` y `_de`, índice |
| `supabase/tests/0036_registro_de_habitos.sql` | pgTAP: checks, RLS, RPC propia, `_de` solo `service_role` |
| `src/lib/domain/development/habit-analytics.ts` | Ranuras por frecuencia, estado de ranura, rachas, cumplimiento de un rango, efecto del toque |
| `tests/domain/habit-analytics.test.ts` | Pruebas del módulo |
| `src/lib/data/habit-analytics.ts` | `loadHabitSeries(from, to)`: RPC + hábitos + rutinas → `HabitSeries[]` |
| `src/app/(app)/development/routines/actions.ts` | `toggleHabitToday` con estados y `ActionResult`; `logHabit`; `sincronizarCierreDeRutina` solo con completados |
| `src/app/(app)/development/routines/reflection-actions.ts` | `saveDailyReflection` |
| `src/app/(app)/development/routines/HabitRow.tsx` | Estado omitido/pospuesto, unidad de racha, botón «…» |
| `src/app/(app)/development/routines/HabitLogSheet.tsx` | Hoja: estado, %, nota, ánimo, energía, fecha ≤ 7 días |
| `src/app/(app)/development/routines/DailyCheckinCard.tsx` | Check-in del día |
| `src/app/(app)/development/routines/page.tsx` | Usa `loadHabitSeries`; pinta el check-in |
| Lectores | `src/lib/data/development.ts`, `src/lib/insights/facts-loader.ts`, `src/app/(app)/development/page.tsx`, `development/nutrition/actions.ts` |
| `src/lib/insights/context.ts` | `habit_logs` amplía `select`; entra `daily_reflections` (growth) |
| `docs/DECISIONS.md` | D-159 y D-162 |

---

### Task 1: Migración y pgTAP

**Files:** Create `supabase/migrations/0063_registro_de_habitos.sql`, `supabase/tests/0036_registro_de_habitos.sql`; regenerate `src/types/database.types.ts`.

**Produces:**
- `habit_logs.status`, `completion_pct`, `note`, `mood`, `energy`, `updated_at`
- tabla `daily_reflections`
- `habit_log_series(p_from date, p_to date)` → `table(habit_id uuid, dates date[], statuses text[], pcts smallint[], moods smallint[], energies smallint[])`
- `habit_log_series_de(p_uid uuid, p_from date, p_to date)`, con la misma forma

- [ ] Escribir el pgTAP con estos casos (en `begin; … rollback`, dos usuarios, patrón de `0021_habitos_en_rutinas.sql`):
  1. `has_column` para cada columna nueva.
  2. Un `skipped` con pct 50 lanza `23514`; un `completed` con pct 0 lanza `23514`.
  3. Una fila vieja sin `status` queda `completed` con 100.
  4. `mood = 6` lanza `23514`.
  5. `daily_reflections`: otro usuario no ve ni puede insertar con `user_id` ajeno; único por día.
  6. `habit_log_series` como titular devuelve sus hábitos; como el otro, 0 filas.
  7. `authenticated` no tiene `execute` en `habit_log_series_de`.
- [ ] Correr `supabase test db` → FALLA (no hay columnas).
- [ ] Escribir la migración. Puntos clave:
  - `check ((status = 'completed') = (completion_pct > 0))`;
  - `note` con `char_length ≤ 500`;
  - trigger `updated_at`;
  - RLS de `daily_reflections` `user_id = auth.uid()`, con `grant`s explícitos;
  - la RPC `security invoker` agrega con `array_agg(... order by log_date)` agrupado por `habit_id`, filtrando por el rango;
  - `_de` es `security definer`, filtra `habits.user_id = p_uid` y hace `revoke execute from public, anon, authenticated; grant execute to service_role`.
- [ ] `supabase migration up && supabase test db` → PASA.
- [ ] `pnpm gen:types:local`.
- [ ] Commit.

### Task 2: Dominio `habit-analytics.ts` (TDD)

**Produces:**

```ts
export type LogStatus = "completed" | "skipped" | "postponed";
export interface HabitLogEntry { date: string; status: LogStatus; pct: number; mood?: number | null; energy?: number | null }
export interface HabitSeries { habitId: string; frequency: Frequency; createdOn: string; logs: HabitLogEntry[] }
export interface Slot { key: string; start: string; end: string }            // ranura: día o semana ISO
export type SlotState = LogStatus | "pending" | "missing";
export function slotsFor(frequency: Frequency, fromISO: string, toISO: string): Slot[]
export function slotStates(series: HabitSeries, fromISO: string, toISO: string, todayISO: string): { slot: Slot; state: SlotState; pct: number }[]
export function habitStreaks(series: HabitSeries, todayISO: string, windowFromISO: string): { current: number; longest: number; unit: "día" | "semana" }
export function completionRate(series: HabitSeries[], fromISO: string, toISO: string, todayISO: string): number | null  // 0..100
export function toggleEffect(existing: LogStatus | null): "insert" | "delete" | "complete"
```

**Reglas:**
- **Ranuras:**
  - `Diario`: un día.
  - `Entre semana`: lunes a viernes.
  - `Fin de semana`: sábado y domingo, cada uno una ranura.
  - `Semanal`: una semana ISO (de lunes a domingo). Cuenta cualquier registro dentro de la semana, lo que corrige que `routineDueToday` solo mire el lunes.
- Una ranura que termina antes de `createdOn` no existe.
- **Estado de la ranura:**
  - si hay registros, el mejor: `completed` > `postponed` > `skipped`, con el pct máximo;
  - si no hay y la ranura contiene a `todayISO`, `pending`;
  - si no, `missing`.
- **Racha:**
  - se recorren las ranuras de la más nueva a la más vieja;
  - `pending` y `postponed` se saltan;
  - `completed` suma 1;
  - `skipped` y `missing` cortan;
  - `longest` es la corrida máxima con las mismas reglas.
- **`completionRate`:**
  - Σ pct / (100 × ranuras que cuentan);
  - cuentan `completed`, `skipped` y `missing`, **no** `postponed` ni `pending`;
  - devuelve `null` si no hay ninguna ranura que cuente.

- [ ] **Tests** (2026-09-14 es lunes):
  - `Diario` con completados 12, 13 y 14, y hoy 15 sin registro → `current = 3` (hoy pendiente no corta).
  - Un `postponed` el 13 entre completados 12 y 14 → `current = 2`, sin cortar.
  - Un `skipped` el 13 → `current = 1`.
  - `Semanal` con registros el miércoles 2 de septiembre y el jueves 10 de septiembre, y hoy 15 → `current = 2`, `unit = "semana"`.
  - `Entre semana` con completados de lunes a viernes 7–11, fin de semana sin registro y hoy lunes 14 completado → `current = 6`.
  - `longest`: 5 completados, un hueco, 2 completados → `longest = 5`, `current = 2`.
  - `createdOn` recorta: un hábito creado hoy sin registros tiene `completionRate` `null`.
  - `completionRate` con 100 + 50 + omitido + pospuesto → (100 + 50 + 0) / 300 = 50.
  - `toggleEffect`: `null` → `insert`, `completed` → `delete`, `skipped` → `complete`, `postponed` → `complete`.
- [ ] Correr y ver fallar, implementar, correr y ver pasar.
- [ ] Commit.

### Task 3: Lectores y acciones con estados

**Consumes:** Task 1 (tipos) y Task 2 (`toggleEffect`).

- [ ] **Lectores** que añaden `.eq("status", "completed")`:
  - `src/lib/data/development.ts`
  - `facts-loader.ts`, que sigue usando `habitStreak` legado para `habitsFacts` y se revisa en F5
  - `development/page.tsx`
  - la consulta de `sincronizarCierreDeRutina`
- [ ] **`toggleHabitToday`:**
  - lee `id, status` de hoy;
  - `toggleEffect` decide:
    - `delete` → borra;
    - `complete` → `update {status: 'completed', completion_pct: 100}`;
    - `insert` → inserta;
  - devuelve `ActionResult` sin lanzar;
  - `HabitRow` pinta `reason`.
- [ ] **`logHabit(input)`:**
  - zod: `habitId` uuid, `date` ISO, `status`, `completionPct` 0..100, `note` ≤ 500, `mood` y `energy` 1..5 opcionales;
  - `date` entre hoy − 7 y hoy (`diffDays`);
  - normaliza `pct`: 0 si no es `completed`, mínimo 1 si lo es;
  - upsert `onConflict: habit_id,log_date`;
  - `audit_log` `habit.log`;
  - sincroniza la rutina **del día registrado**;
  - revalida.
- [ ] **`nutrition/actions.ts`:**
  - se mantiene el upsert con `ignoreDuplicates`;
  - después, un `update {status: 'completed', completion_pct: 100}` donde `status <> 'completed'`, de modo que una comida registrada convierte un omitido en hecho sin pisar un parcial ya completado.
- [ ] **`context.ts`:**
  - `habit_logs.select = "id, habit_id, log_date, status, completion_pct, note, mood, energy"`;
  - `daily_reflections: {domain: "growth", fecha: "local_date", select: "id, local_date, mood, energy, sleep_hours, reflection_prompt, reflection, wins"}`.
- [ ] `pnpm typecheck && pnpm test:unit`.
- [ ] Commit.

### Task 4: Cargador de series y página

- [ ] **`src/lib/data/habit-analytics.ts`** (`server-only`, `cache`):
  - `loadHabitSeries(fromISO, toISO)` llama a `supabase.rpc("habit_log_series", …)`;
  - lee `habits(id, created_at, routine_id)` y `routines(id, frequency)`;
  - `createdOn = todayInTimeZone(tz, new Date(created_at))`.
- [ ] **`routines/page.tsx`:**
  - sustituye la consulta de `habit_logs` por `loadHabitSeries(today − 399, today)`;
  - de ahí sale el estado de hoy de cada hábito (`slotStates` de la ranura actual) y la racha (`habitStreaks`).
- [ ] **`RunnerHabit`** gana:
  - `todayState: SlotState`, `todayPct`, `note`, `mood`, `energy`;
  - `streakUnit: "día" | "semana"`.
- [ ] Commit.

### Task 5: Hoja de detalle y check-in

- [ ] **`HabitLogSheet.tsx`** (cliente, sobre `FormSheet` con la etiqueta «…»):
  - selector de estado: Hecho / Parcial / Pospuesto / Omitido;
  - rango de % si es Parcial;
  - nota;
  - ánimo y energía con 5 botones cada uno, anulables;
  - fecha (hoy o hasta 7 días atrás, con `max = today` recibido como prop);
  - guarda con `logHabit`;
  - muestra `reason` si falla.
- [ ] **`HabitRow`:**
  - omitido: círculo con borde `var(--bad)` y «–»;
  - pospuesto: borde `var(--warn)` y «→»;
  - parcial: anillo `conic-gradient` con el pct;
  - la racha dice «N días» o «N semanas» de racha;
  - el botón «…» abre la hoja.
- [ ] **`reflection-actions.ts`:** `saveDailyReflection(input)`:
  - zod con `mood` y `energy` 1..5 opcionales, `sleepHours` 0..24 en pasos de 0,5, `reflection` ≤ 2000, `wins` ≤ 1000;
  - upsert `onConflict: user_id,local_date` con `local_date = todayForUser()`.
- [ ] **`DailyCheckinCard.tsx`** (cliente):
  - ánimo, energía, sueño y dos textareas;
  - prellenado con la fila de hoy;
  - botón «Guardar check-in»;
  - se pinta en `routines/page.tsx` después de las rutinas de hoy.
- [ ] **Verificación:**
  - `pnpm typecheck && pnpm lint && pnpm test:unit`;
  - `pnpm build && pnpm start`;
  - en navegador: marcar, omitir, posponer, parcial con nota, check-in; recargar y ver que persiste.
- [ ] Commit.

### Task 6: Decisiones y PR

- [ ] En `docs/DECISIONS.md`:
  - **D-159:** estados de `habit_logs`, reglas de ranura y racha; qué corrige.
  - **D-162:** analítica derivada sin tablas de estadísticas; la RPC en arreglos esquiva `max_rows`.
- [ ] Commit, push y PR con base `docs/identidad-y-analitica`. El cuerpo avisa: **aplicar `0063` en la nube (`supabase db push`) antes de desplegar**.
