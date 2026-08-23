# Personal Development OS — Fase 1 (núcleo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el módulo Personal Development OS con metas personales medibles, rutinas ejecutables y la biblioteca/hábitos ya existentes reubicados bajo un solo techo, sin ninguna dependencia externa.

**Architecture:** Toda la aritmética vive en funciones puras bajo `src/lib/domain/development/`, probadas con `node --test`. Las páginas son Server Components que leen de Supabase y pasan "hoy" ya calculado a los Client Components. Las rutinas no duplican conceptos: el bloque horario sigue en `occupations` y la racha sigue en `habit_logs` — completar un paso ligado a un hábito escribe en `habit_logs` por un camino idempotente.

**Tech Stack:** Next.js 15.5 (App Router, Server Actions), React 19, Supabase (Postgres + RLS), zod 3.24, Tailwind 3.4, `node --test` con `--experimental-strip-types`, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-22-personal-development-os-design.md`

## Global Constraints

Aplican a **todas** las tareas. No se repiten en cada una.

- **Privacidad (BR-012/019/027):** ninguna tabla nueva lleva `workspace_id` ni referencia `has_project_access`. Política única: `user_id = auth.uid()`, o vía el padre cuando la tabla es hija (patrón de `habit_logs`/`book_notes`).
- **GRANT explícito (F9 🔴):** cada migración incluye su bloque `grant` para `anon`, `authenticated` y `service_role`. `0010_default_privileges.sql` es red de seguridad, no sustituto.
- **Fechas (D-016/D-018):** nunca `new Date()` para obtener "hoy". Siempre `todayLocal(await getUserTimeZone())`. El Server Component calcula el día una vez y lo pasa como prop a los Client Components.
- **Dependencias (D-008 🔴):** cero paquetes npm nuevos. Íconos SVG inline en `src/components/icons.tsx`.
- **Imports de dominio:** con extensión `.ts` explícita (`@/lib/domain/development/goals.ts`), porque los tests corren con `--experimental-strip-types`.
- **Ubicación de tests unitarios:** `tests/domain/*.test.ts` **plano**. El script es `node --experimental-strip-types --test tests/domain/*.test.ts` (`package.json`) y ese glob **no entra a subdirectorios**. Un test en `tests/domain/development/` no se ejecutaría nunca. Usar nombres como `tests/domain/development-goals.test.ts`.
- **Numeración de migraciones:** `0024` en adelante. Si Intelligence OS ya aplicó `0023_intelligence_fingerprint.sql`, respetar; si no existe, **no** rellenar el hueco — `0023` queda reservado.
- **Server Actions:** patrón de `src/app/(app)/habits/actions.ts` — `"use server"`, zod para validar entrada, `supabase.auth.getUser()` y `throw new Error("No autenticado")` si no hay sesión, `revalidatePath` al final.
- **Verificación por tarea:** `pnpm typecheck && pnpm lint` deben pasar antes de cada commit.

---

### Task 1: Mover Hábitos y Biblioteca al módulo nuevo

Crea el grupo de navegación y separa las dos mitades que hoy conviven en `/habits`. Sin base de datos y sin lógica nueva: es la tarea que hace visible el módulo.

**Files:**
- Modify: `src/components/icons.tsx` (añadir íconos + claves en `NAV_ICONS`)
- Modify: `src/components/nav-items.ts:29` (quitar `/habits` de Execution OS, añadir grupo nuevo)
- Move: `src/app/(app)/habits/{page,HabitForm,HabitRow,BookForm,actions}.tsx|ts` → `src/app/(app)/development/habits/`
- Create: `src/app/(app)/development/library/page.tsx`, `src/app/(app)/development/library/actions.ts`
- Create: `src/app/(app)/habits/page.tsx` (redirección)
- Modify: `docs/UX_MAP.md` (fila de Hábitos y Lectura)

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: las rutas `/development/habits` y `/development/library`; el grupo `"Personal Development OS"` en `NAV_ITEMS`; las claves `development`, `personalGoals`, `routines`, `library` en `NAV_ICONS`.

- [ ] **Step 1: Mover la carpeta con `git mv` para conservar historial**

```bash
mkdir -p "src/app/(app)/development"
git mv "src/app/(app)/habits" "src/app/(app)/development/habits"
mkdir -p "src/app/(app)/development/library"
git mv "src/app/(app)/development/habits/BookForm.tsx" "src/app/(app)/development/library/BookForm.tsx"
```

- [ ] **Step 2: Extraer las Server Actions de libros a la biblioteca**

Crear `src/app/(app)/development/library/actions.ts` moviendo **tal cual** `upsertBook`, `deleteBook` y `addBookNote` desde `src/app/(app)/development/habits/actions.ts` (incluida la interfaz `BookUpsertPayload` y su comentario sobre TS2769 — explica por qué el payload no es `Record<string, unknown>`; perder ese comentario reintroduce el bug).

En el archivo movido, cambiar las rutas revalidadas:

```ts
revalidatePath("/development/library");
revalidatePath("/home");
```

Borrar esas tres funciones y `BookUpsertPayload` de `habits/actions.ts`, y cambiar sus `revalidatePath("/habits")` por `revalidatePath("/development/habits")`.

- [ ] **Step 3: Partir la página en dos**

`src/app/(app)/development/habits/page.tsx` conserva solo la mitad de hábitos: la nota superior, el encabezado "Hábitos", el `<Card>` con los `HabitRow` y sus `HabitForm`. Se eliminan las consultas de `books` y `book_notes` y todo el bloque de agrupación `grouped`.

`src/app/(app)/development/library/page.tsx` es nuevo y contiene la mitad de lectura, movida sin cambios de lógica: consulta `books` y `book_notes`, agrupa por estado y renderiza las tarjetas con `BookForm`. Importa `Card` y `EmptyState` de `@/components/ui`.

- [ ] **Step 4: Dejar la ruta vieja como redirección**

```tsx
// src/app/(app)/habits/page.tsx
// La vista se dividió en /development/habits y /development/library al crear el
// Personal Development OS. La ruta vieja se conserva —no se elimina— porque
// puede estar guardada en marcadores del usuario.
import { redirect } from "next/navigation";

export default function HabitsRedirect() {
  redirect("/development/habits");
}
```

- [ ] **Step 5: Añadir los íconos**

En `src/components/icons.tsx`, cuatro íconos nuevos con el helper `base()` ya existente (stroke 1.8, viewBox 24x24), y sus claves en `NAV_ICONS`:

```tsx
export const IconDevelopment = (p: IconProps) =>
  base(<><path d="M12 3v18" /><path d="M5 8l7-5 7 5" /><path d="M5 16l7 5 7-5" /></>, p);

export const IconPersonalGoals = (p: IconProps) =>
  base(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>, p);

export const IconRoutines = (p: IconProps) =>
  base(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" /></>, p);

export const IconLibrary = (p: IconProps) =>
  base(<><path d="M4 5v14" /><path d="M8 4h9a2 2 0 0 1 2 2v13H8z" /><path d="M8 9h8" /></>, p);
```

```ts
// dentro de NAV_ICONS
  development: IconDevelopment,
  personalGoals: IconPersonalGoals,
  routines: IconRoutines,
  library: IconLibrary,
```

- [ ] **Step 6: Reorganizar la navegación**

En `src/components/nav-items.ts`, **borrar** la línea de `/habits` del grupo Execution OS (`:29`) e insertar, después del bloque de Execution OS y antes de Money OS:

```ts
  { href: "/development/habits", label: "Hábitos", group: "Personal Development OS", icon: "habits", color: "var(--c-orange)" },
  { href: "/development/library", label: "Biblioteca", group: "Personal Development OS", icon: "library", color: "var(--c-orange)" },
```

Las rutas `/development`, `/development/goals` y `/development/routines` se agregan en sus propias tareas, cuando ya existan — un item de navegación que apunta a un 404 es peor que un item ausente.

- [ ] **Step 7: Verificar que compila y que nada quedó apuntando a `/habits`**

```bash
grep -rn '"/habits"' src/ ; pnpm typecheck && pnpm lint
```

Esperado: el único resultado del `grep` es el `redirect` del Step 4. Typecheck y lint en verde.

- [ ] **Step 8: Verificar en la app real**

```bash
pnpm dev
```

Abrir `http://localhost:3000/habits` → debe redirigir a `/development/habits`. Comprobar que la sidebar muestra el grupo "Personal Development OS" en naranja, que marcar un hábito sigue actualizando su racha, y que `/development/library` lista los libros con sus notas.

- [ ] **Step 9: Actualizar el UX_MAP**

En `docs/UX_MAP.md`, sustituir la fila `Hábitos y Lectura` por dos filas:

```markdown
| Hábitos | `/development/habits` | `development/habits/page.tsx` | `habits`,`habit_logs`,`occupations` | `upsertHabit`,`toggleHabitToday`,`deleteHabit` |
| Biblioteca | `/development/library` | `development/library/page.tsx` | `books`,`book_notes` | `upsertBook`,`addBookNote`,`deleteBook` |
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Mover Hábitos y Biblioteca al Personal Development OS

/habits mezclaba dos vistas distintas colgando de Execution OS. Ahora son dos
rutas separadas bajo el módulo propio, y la ruta vieja redirige para no romper
marcadores. Sin cambios de lógica: las Server Actions se movieron tal cual."
```

---

### Task 2: Migración 0024 — tablas del núcleo

**Files:**
- Create: `supabase/migrations/0024_personal_development.sql`
- Create: `supabase/tests/0007_rls_development.sql`
- Modify: `src/types/database.types.ts` (regenerado, no editado a mano)

**Interfaces:**
- Consumes: `public.occupations`, `public.habits` (`0004`).
- Produces: tablas `personal_goals`, `key_results`, `routines`, `routine_steps`, `routine_runs` con RLS activa.

- [ ] **Step 1: Escribir el test pgTAP primero**

```sql
-- supabase/tests/0007_rls_development.sql — pgTAP: Personal Development OS.
-- BR-012/019/027: todo el módulo es privado por user_id. Ningún rol de
-- workspace lo alcanza, y un usuario no ve las filas de otro.

begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-titular@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-otro@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('11111111-1111-4111-8111-111111111111', 'Titular Dev'),
  ('22222222-2222-4222-8222-222222222222', 'Otro Dev')
on conflict (user_id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.personal_goals (id, user_id, title, area, horizon)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Leer 24 libros', 'Aprendizaje', '2026-12-31');

insert into public.key_results (id, goal_id, title, source_kind, target)
values ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 'Libros terminados', 'manual', 24);

insert into public.occupations (id, user_id, title, start_time, end_time, category, occ_date)
values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Mañana', '06:00', '07:00', 'Personal', current_date);

insert into public.habits (id, user_id, name)
values ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'Meditar');

insert into public.routines (id, user_id, name, occupation_id)
values ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 'Rutina matutina', '55555555-5555-4555-8555-555555555555');

insert into public.routine_steps (id, routine_id, position, title, duration_min, habit_id)
values ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', 0, 'Meditar 10 min', 10, '66666666-6666-4666-8666-666666666666');

-- BR-026: borrar la ocupación NO borra la rutina, solo la desliga
delete from public.occupations where id = '55555555-5555-4555-8555-555555555555';
select is(
  (select occupation_id from public.routines where id = '77777777-7777-4777-8777-777777777777'),
  null,
  'occupation_id de la rutina queda en null al borrar la ocupación (BR-026)'
);

-- Borrar el hábito NO borra el paso de rutina
delete from public.habits where id = '66666666-6666-4666-8666-666666666666';
select is(
  (select habit_id from public.routine_steps where id = '88888888-8888-4888-8888-888888888888'),
  null,
  'habit_id del paso queda en null al borrar el hábito, el paso sobrevive'
);

-- Un solo run por rutina y día
insert into public.routine_runs (routine_id, local_date) values ('77777777-7777-4777-8777-777777777777', current_date);
select throws_ok(
  $$ insert into public.routine_runs (routine_id, local_date) values ('77777777-7777-4777-8777-777777777777', current_date) $$,
  '23505',
  null,
  'routine_runs es único por (routine_id, local_date)'
);

-- El otro usuario no ve nada
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select is_empty(
  $$ select 1 from public.personal_goals $$,
  'Otro usuario no ve las metas personales del titular (BR-012)'
);
select is_empty(
  $$ select 1 from public.key_results $$,
  'Otro usuario no ve los resultados clave del titular, protegidos vía el padre'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
supabase db reset && supabase test db
```

Esperado: FALLA con `relation "public.personal_goals" does not exist`.

- [ ] **Step 3: Escribir la migración**

```sql
-- 0024_personal_development.sql
-- Personal Development OS, Fase 1: metas personales con resultados clave y
-- rutinas ejecutables.
--
-- BR-012/019/027: TODAS estas tablas son privadas por user_id, SIN
-- workspace_id y SIN relación con has_project_access — misma regla que
-- 0004_planning_time_habits.sql. Ningún rol de workspace las alcanza.
--
-- Lo que este módulo deliberadamente NO duplica: el bloque horario sigue
-- viviendo en `occupations` y la racha sigue viviendo en `habit_logs`. Las
-- rutinas solo aportan el ORDEN de los pasos.

-- =============================================================================
-- METAS PERSONALES
-- =============================================================================
create table if not exists public.personal_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  area text not null default 'Personal'
    check (area in ('Salud','Carrera','Relaciones','Finanzas','Aprendizaje','Espiritual','Personal')),
  horizon date,
  status text not null default 'Activa'
    check (status in ('Activa','Pausada','Lograda','Abandonada')),
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.personal_goals is 'Meta personal con área de vida y horizonte. Privada por user_id (BR-012).';
comment on column public.personal_goals.area is 'Columna con check, no tabla: son siete valores fijos — mismo criterio que habits.category.';

create table if not exists public.key_results (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.personal_goals(id) on delete cascade,
  title text not null,
  source_kind text not null default 'manual'
    check (source_kind in ('habit','project','book','financial_goal','manual')),
  source_id uuid,
  target numeric(20,6) not null default 0,
  manual_current numeric(20,6) not null default 0,
  unit text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint key_results_source_shape check ((source_kind = 'manual') = (source_id is null))
);
comment on column public.key_results.source_id is
  'uuid SIN FK a propósito: apunta a cuatro tablas distintas (habits/projects/books/financial_goals). Si la fuente desaparece, la capa de dominio marca el resultado como `stale` en vez de mostrar 0% como dato real.';

-- =============================================================================
-- RUTINAS
-- =============================================================================
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  frequency text not null default 'Diario'
    check (frequency in ('Diario','Semanal','Entre semana','Fin de semana')),
  occupation_id uuid references public.occupations(id) on delete set null,
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
comment on column public.routines.frequency is 'Mismos cuatro valores que habits.frequency: una rutina y un hábito responden "¿toca hoy?" con la misma función.';
comment on column public.routines.occupation_id is 'on delete set null (BR-026): borrar el bloque horario no borra la rutina.';

create table if not exists public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  position integer not null default 0,
  title text not null,
  duration_min integer not null default 5 check (duration_min > 0),
  habit_id uuid references public.habits(id) on delete set null
);
comment on column public.routine_steps.habit_id is 'Un paso puede SER un hábito existente: completarlo escribe en habit_logs, así la racha no se bifurca.';

create table if not exists public.routine_runs (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  local_date date not null,
  completed_step_ids uuid[] not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (routine_id, local_date)
);
comment on table public.routine_runs is 'Único por (routine_id, local_date), igual que habit_logs por (habit_id, log_date): dos clics simultáneos no crean dos ejecuciones del mismo día.';

-- =============================================================================
-- Índices
-- =============================================================================
create index if not exists idx_personal_goals_user_status on public.personal_goals(user_id, status);
create index if not exists idx_key_results_goal on public.key_results(goal_id, position);
create index if not exists idx_routines_user_active on public.routines(user_id, active);
create index if not exists idx_routine_steps_routine on public.routine_steps(routine_id, position);
create index if not exists idx_routine_runs_routine_date on public.routine_runs(routine_id, local_date desc);

-- =============================================================================
-- RLS (BR-012/019/027)
-- =============================================================================
alter table public.personal_goals enable row level security;
alter table public.key_results enable row level security;
alter table public.routines enable row level security;
alter table public.routine_steps enable row level security;
alter table public.routine_runs enable row level security;

create policy personal_goals_own on public.personal_goals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy routines_own on public.routines for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tablas hijas: se protegen vía el padre, patrón de habit_logs/book_notes.
create policy key_results_own on public.key_results for all
  using (exists (select 1 from public.personal_goals g where g.id = goal_id and g.user_id = auth.uid()))
  with check (exists (select 1 from public.personal_goals g where g.id = goal_id and g.user_id = auth.uid()));
create policy routine_steps_own on public.routine_steps for all
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));
create policy routine_runs_own on public.routine_runs for all
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));

-- =============================================================================
-- GRANTS (F9 🔴)
-- =============================================================================
grant select on public.personal_goals, public.key_results, public.routines,
  public.routine_steps, public.routine_runs to anon, authenticated;
grant insert, update, delete on public.personal_goals, public.key_results, public.routines,
  public.routine_steps, public.routine_runs to authenticated;
grant all privileges on public.personal_goals, public.key_results, public.routines,
  public.routine_steps, public.routine_runs to service_role;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
supabase db reset && supabase test db
```

Esperado: `0007_rls_development.sql` con 5 assertions en verde, y los seis archivos de test previos sin regresiones.

- [ ] **Step 5: Regenerar los tipos de TypeScript**

```bash
pnpm gen:types && pnpm typecheck
```

`src/types/database.types.ts` se **genera**, nunca se edita a mano. Esperado: el archivo gana las cinco tablas y `pnpm typecheck` pasa.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0024_personal_development.sql supabase/tests/0007_rls_development.sql src/types/database.types.ts
git commit -m "Crear las tablas del Personal Development OS

Metas con resultados clave y rutinas con pasos y ejecución diaria. Todo
privado por user_id, sin workspace_id, como el resto de la planeación
personal (BR-012/019/027).

key_results.source_id no lleva FK porque apunta a cuatro tablas distintas;
la integridad se resuelve al leer marcando el resultado como stale."
```

---

### Task 3: Dominio de metas — el progreso se calcula, no se teclea

**Files:**
- Create: `src/lib/domain/development/goals.ts`
- Test: `tests/domain/development-goals.test.ts`

**Interfaces:**
- Consumes: `diffDays` de `@/lib/domain/datetime.ts`.
- Produces:
  - `type KeyResultSourceKind = "habit" | "project" | "book" | "financial_goal" | "manual"`
  - `interface KeyResultLike { id: string; sourceKind: KeyResultSourceKind; sourceId: string | null; target: number; manualCurrent: number }`
  - `interface SourceSnapshot { habitCompletionPct: Record<string, number>; projectDonePct: Record<string, number>; bookPagesRead: Record<string, number>; financialGoalAmount: Record<string, number> }`
  - `interface KeyResultProgress { current: number; target: number; pct: number; stale: boolean }`
  - `keyResultProgress(kr: KeyResultLike, sources: SourceSnapshot): KeyResultProgress`
  - `goalProgress(krs: KeyResultProgress[]): number`
  - `goalAtRisk(startISO: string, horizonISO: string, pct: number, todayISO: string, thresholdPoints?: number): boolean`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/domain/development-goals.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  keyResultProgress,
  goalProgress,
  goalAtRisk,
  type KeyResultLike,
  type SourceSnapshot
} from "../../src/lib/domain/development/goals.ts";

const EMPTY: SourceSnapshot = {
  habitCompletionPct: {},
  projectDonePct: {},
  bookPagesRead: {},
  financialGoalAmount: {}
};

function kr(over: Partial<KeyResultLike> = {}): KeyResultLike {
  return { id: "k1", sourceKind: "manual", sourceId: null, target: 10, manualCurrent: 0, ...over };
}

test("keyResultProgress: fuente manual usa manual_current", () => {
  const r = keyResultProgress(kr({ manualCurrent: 5, target: 10 }), EMPTY);
  assert.deepStrictEqual(r, { current: 5, target: 10, pct: 50, stale: false });
});

test("keyResultProgress: fuente hábito lee el % de cumplimiento", () => {
  const sources: SourceSnapshot = { ...EMPTY, habitCompletionPct: { h1: 60 } };
  const r = keyResultProgress(kr({ sourceKind: "habit", sourceId: "h1", target: 80 }), sources);
  assert.strictEqual(r.current, 60);
  assert.strictEqual(r.pct, 75); // 60 de 80
  assert.strictEqual(r.stale, false);
});

test("keyResultProgress: fuente borrada devuelve stale, no un 0% que parece dato real", () => {
  const r = keyResultProgress(kr({ sourceKind: "book", sourceId: "b-borrado", target: 300 }), EMPTY);
  assert.strictEqual(r.stale, true);
  assert.strictEqual(r.pct, 0);
});

test("keyResultProgress: acota el porcentaje a 100 aunque se rebase la meta", () => {
  const r = keyResultProgress(kr({ manualCurrent: 30, target: 10 }), EMPTY);
  assert.strictEqual(r.pct, 100);
});

test("keyResultProgress: meta en cero no divide entre cero", () => {
  const r = keyResultProgress(kr({ manualCurrent: 5, target: 0 }), EMPTY);
  assert.strictEqual(r.pct, 0);
});

test("goalProgress: promedio simple de los resultados clave", () => {
  assert.strictEqual(goalProgress([
    { current: 0, target: 0, pct: 100, stale: false },
    { current: 0, target: 0, pct: 50, stale: false }
  ]), 75);
});

test("goalProgress: una meta sin resultados clave va en 0, no en NaN", () => {
  assert.strictEqual(goalProgress([]), 0);
});

test("goalAtRisk: 65% del horizonte transcurrido con 40% de avance está en riesgo", () => {
  // 2026-01-01 a 2026-12-31 = 364 días; 2026-08-22 = día 233 (64%)
  assert.strictEqual(goalAtRisk("2026-01-01", "2026-12-31", 40, "2026-08-22"), true);
});

test("goalAtRisk: avance a la par del calendario no está en riesgo", () => {
  assert.strictEqual(goalAtRisk("2026-01-01", "2026-12-31", 64, "2026-08-22"), false);
});

test("goalAtRisk: el primer día nunca está en riesgo", () => {
  assert.strictEqual(goalAtRisk("2026-08-22", "2026-12-31", 0, "2026-08-22"), false);
});

test("goalAtRisk: horizonte vencido sin completar está en riesgo", () => {
  // El calendario va en 100% (el horizonte ya pasó) y el avance en 70%.
  assert.strictEqual(goalAtRisk("2026-01-01", "2026-06-30", 70, "2026-08-22"), true);
});

test("goalAtRisk: el umbral es estricto — exactamente 20 puntos de atraso todavía no es riesgo", () => {
  assert.strictEqual(goalAtRisk("2026-01-01", "2026-06-30", 80, "2026-08-22"), false);
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
pnpm test:unit
```

Esperado: FALLA con `Cannot find module .../development/goals.ts`.

- [ ] **Step 3: Escribir la implementación mínima**

```ts
// src/lib/domain/development/goals.ts
// Metas personales — lógica pura, sin React ni Supabase (probada en
// tests/domain/development-goals.test.ts).
//
// La regla del módulo: el progreso NO se teclea. Cada resultado clave declara
// de dónde sale su número y esta capa lo calcula. Un progreso capturado a mano
// se desactualiza y convierte el módulo en una libreta.

import { diffDays } from "../datetime.ts";

export type KeyResultSourceKind = "habit" | "project" | "book" | "financial_goal" | "manual";

export interface KeyResultLike {
  id: string;
  sourceKind: KeyResultSourceKind;
  sourceId: string | null;
  target: number;
  manualCurrent: number;
}

/** Valor actual de cada fuente posible, ya leído de la base por la capa de datos. */
export interface SourceSnapshot {
  habitCompletionPct: Record<string, number>;
  projectDonePct: Record<string, number>;
  bookPagesRead: Record<string, number>;
  financialGoalAmount: Record<string, number>;
}

export interface KeyResultProgress {
  current: number;
  target: number;
  pct: number;
  /** La fuente ya no existe. La UI lo dice; no se finge un 0% real. */
  stale: boolean;
}

function pctOf(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

export function keyResultProgress(kr: KeyResultLike, sources: SourceSnapshot): KeyResultProgress {
  if (kr.sourceKind === "manual") {
    return { current: kr.manualCurrent, target: kr.target, pct: pctOf(kr.manualCurrent, kr.target), stale: false };
  }

  const table =
    kr.sourceKind === "habit" ? sources.habitCompletionPct
    : kr.sourceKind === "project" ? sources.projectDonePct
    : kr.sourceKind === "book" ? sources.bookPagesRead
    : sources.financialGoalAmount;

  const current = kr.sourceId === null ? undefined : table[kr.sourceId];
  if (current === undefined) return { current: 0, target: kr.target, pct: 0, stale: true };
  return { current, target: kr.target, pct: pctOf(current, kr.target), stale: false };
}

/** Promedio simple. Un resultado `stale` cuenta como 0 y la UI lo señala aparte. */
export function goalProgress(krs: KeyResultProgress[]): number {
  if (krs.length === 0) return 0;
  return Math.round(krs.reduce((sum, k) => sum + k.pct, 0) / krs.length);
}

/**
 * En riesgo = el calendario va más adelantado que el avance, por más de
 * `thresholdPoints` puntos porcentuales. Es una resta, no un modelo.
 */
export function goalAtRisk(
  startISO: string,
  horizonISO: string,
  pct: number,
  todayISO: string,
  thresholdPoints = 20
): boolean {
  const total = diffDays(startISO, horizonISO);
  if (total <= 0) return pct < 100; // horizonte vencido o inválido
  const elapsed = diffDays(startISO, todayISO);
  if (elapsed <= 0) return false;
  const expectedPct = Math.min(100, (elapsed / total) * 100);
  return expectedPct - pct > thresholdPoints;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
pnpm test:unit
```

Esperado: los 11 tests nuevos en verde, sin regresiones en los existentes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/development/goals.ts tests/domain/development-goals.test.ts
git commit -m "Calcular el progreso de una meta desde su fuente real

Un resultado clave declara de dónde sale su número (hábito, proyecto, libro,
meta financiera o captura manual) y esta capa lo calcula. Si la fuente fue
borrada devuelve stale en vez de un 0% que parece dato real."
```

---

### Task 4: Metas personales — lectura, acciones y vista

**Files:**
- Create: `src/lib/data/development.ts`
- Create: `src/app/(app)/development/goals/{page.tsx,actions.ts,GoalForm.tsx,KeyResultForm.tsx}`
- Modify: `src/components/nav-items.ts`
- Modify: `docs/UX_MAP.md`

**Interfaces:**
- Consumes: `keyResultProgress`, `goalProgress`, `goalAtRisk`, `SourceSnapshot` (Task 3); `getUserTimeZone`, `todayLocal`.
- Produces: `loadSourceSnapshot(): Promise<SourceSnapshot>` en `src/lib/data/development.ts`; Server Actions `upsertPersonalGoal(id, formData)`, `deletePersonalGoal(id)`, `upsertKeyResult(goalId, id, formData)`, `deleteKeyResult(id)`.

- [ ] **Step 1: Construir el snapshot de fuentes**

```ts
// src/lib/data/development.ts
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { todayLocal, addDaysISO } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import type { SourceSnapshot } from "@/lib/domain/development/goals.ts";

/**
 * Valor actual de cada fuente que puede alimentar un resultado clave.
 * Envuelto en React `cache()` como getUserTimeZone(): /development y
 * /development/goals lo piden dentro del mismo request.
 *
 * PRIVACIDAD (BR-012): los proyectos se filtran a `workspace_id is null`. Un
 * resultado clave solo puede medirse contra un proyecto PERSONAL — si no, el
 * avance de un equipo se filtraría a un módulo declarado privado.
 */
export const loadSourceSnapshot = cache(async (): Promise<SourceSnapshot> => {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { habitCompletionPct: {}, projectDonePct: {}, bookPagesRead: {}, financialGoalAmount: {} };

  const today = todayLocal(await getUserTimeZone());
  const from = addDaysISO(today, -29); // ventana de 30 días para hábitos

  const [{ data: habits }, { data: logs }, { data: projects }, { data: books }, { data: fgoals }] = await Promise.all([
    supabase.from("habits").select("id"),
    supabase.from("habit_logs").select("habit_id, log_date").gte("log_date", from).lte("log_date", today),
    supabase.from("projects").select("id").is("workspace_id", null),
    supabase.from("books").select("id, current_page"),
    supabase.from("financial_goals").select("id, current_amount")
  ]);

  const habitCompletionPct: Record<string, number> = {};
  for (const h of habits ?? []) {
    const hits = (logs ?? []).filter((l) => l.habit_id === h.id).length;
    habitCompletionPct[h.id] = Math.round((hits / 30) * 100);
  }

  const projectIds = (projects ?? []).map((p) => p.id);
  const projectDonePct: Record<string, number> = {};
  if (projectIds.length) {
    const { data: tasks } = await supabase.from("tasks").select("project_id, status").in("project_id", projectIds);
    for (const id of projectIds) {
      const own = (tasks ?? []).filter((t) => t.project_id === id);
      const done = own.filter((t) => t.status === "Completed").length;
      projectDonePct[id] = own.length ? Math.round((done / own.length) * 100) : 0;
    }
  }

  const bookPagesRead: Record<string, number> = {};
  for (const b of books ?? []) bookPagesRead[b.id] = b.current_page;

  const financialGoalAmount: Record<string, number> = {};
  for (const g of fgoals ?? []) financialGoalAmount[g.id] = Number(g.current_amount);

  return { habitCompletionPct, projectDonePct, bookPagesRead, financialGoalAmount };
});
```

- [ ] **Step 2: Escribir las Server Actions**

```ts
// src/app/(app)/development/goals/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const goalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  area: z.enum(["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"]),
  horizon: z.string().optional().or(z.literal("")),
  status: z.enum(["Activa", "Pausada", "Lograda", "Abandonada"])
});

export async function upsertPersonalGoal(id: string | null, formData: FormData) {
  const parsed = goalSchema.parse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    area: formData.get("area"),
    horizon: formData.get("horizon") ?? "",
    status: formData.get("status") ?? "Activa"
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    title: parsed.title,
    description: parsed.description,
    area: parsed.area,
    horizon: parsed.horizon || null,
    status: parsed.status,
    achieved_at: parsed.status === "Lograda" ? new Date().toISOString() : null
  };

  if (id) {
    const { error } = await supabase.from("personal_goals").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("personal_goals").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }

  await supabase.from("audit_log").insert({ user_id: user.id, action: "personal_goal.upsert", object: id ?? "" });
  revalidatePath("/development/goals");
  revalidatePath("/development");
}

export async function deletePersonalGoal(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("personal_goals").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/goals");
  revalidatePath("/development");
}

const krSchema = z.object({
  title: z.string().min(1),
  sourceKind: z.enum(["habit", "project", "book", "financial_goal", "manual"]),
  sourceId: z.string().uuid().optional().or(z.literal("")),
  target: z.coerce.number().min(0).default(0),
  manualCurrent: z.coerce.number().min(0).default(0),
  unit: z.string().optional().default("")
});

export async function upsertKeyResult(goalId: string, id: string | null, formData: FormData) {
  const parsed = krSchema.parse({
    title: formData.get("title"),
    sourceKind: formData.get("sourceKind"),
    sourceId: formData.get("sourceId") ?? "",
    target: formData.get("target") ?? 0,
    manualCurrent: formData.get("manualCurrent") ?? 0,
    unit: formData.get("unit") ?? ""
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const sourceId = parsed.sourceKind === "manual" ? null : parsed.sourceId || null;
  if (parsed.sourceKind !== "manual" && !sourceId) throw new Error("Elige la fuente que va a medir este resultado clave.");

  // BR-012: solo proyectos PERSONALES pueden medir un resultado clave. Se
  // resuelve en el servidor consultando projects.workspace_id, nunca
  // confiando en un parámetro del cliente.
  if (parsed.sourceKind === "project" && sourceId) {
    const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", sourceId).single();
    if (project?.workspace_id) throw new Error("Un resultado clave solo puede medirse contra un proyecto personal, no contra uno de un workspace.");
  }

  const payload = {
    title: parsed.title,
    source_kind: parsed.sourceKind,
    source_id: sourceId,
    target: parsed.target,
    manual_current: parsed.manualCurrent,
    unit: parsed.unit
  };

  if (id) {
    const { error } = await supabase.from("key_results").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("key_results").insert({ ...payload, goal_id: goalId });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/development/goals");
  revalidatePath("/development");
}

export async function deleteKeyResult(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("key_results").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/goals");
  revalidatePath("/development");
}
```

Este archivo **no** importa `todayLocal` ni `getUserTimeZone`: ninguna de estas acciones necesita la fecha del usuario. `achieved_at` es un instante (`timestamptz`), no un día, así que `new Date().toISOString()` es correcto aquí y no contradice D-016.

- [ ] **Step 3: Escribir la página**

`src/app/(app)/development/goals/page.tsx` — Server Component con la estructura de `src/app/(app)/development/habits/page.tsx`:

1. `createClient()`, `supabase.auth.getUser()`, `redirect("/login")` si no hay sesión.
2. `Promise.all` de: `personal_goals` (order `created_at`), `key_results`, y las listas para los selectores de fuente (`habits` id+name, `projects` id+title filtrado por `.is("workspace_id", null)`, `books` id+title, `financial_goals` id+name).
3. `const today = todayLocal(await getUserTimeZone())` y `const sources = await loadSourceSnapshot()`.
4. Por cada meta: mapear sus `key_results` con `keyResultProgress`, sacar `goalProgress`, y `goalAtRisk(goal.created_at.slice(0,10), goal.horizon, pct, today)` cuando `horizon` no sea nulo.
5. Render: `<Card>` por meta con `<Progress pct={pct} kind={atRisk ? "warn" : undefined} />`, `<Chip>` del área, chip `bad` "En riesgo" cuando aplica, y por cada resultado clave su barra con `current/target unit`. Un resultado `stale` muestra `<Chip kind="warn">fuente eliminada</Chip>` en lugar del porcentaje.
6. `<EmptyState icon="🎯" text="Define tu primera meta personal. El progreso se calcula solo desde tus hábitos, proyectos y libros." />` cuando no hay metas.

`GoalForm.tsx` y `KeyResultForm.tsx` son Client Components calcados de `HabitForm.tsx`: `useState(open)`, `useTransition`, `try/catch` que guarda el error en estado y lo muestra inline con `color: var(--danger)`. En `KeyResultForm`, el `<select name="sourceKind">` controla qué segundo `<select name="sourceId">` se muestra; con `manual` se muestra en su lugar `<input name="manualCurrent" type="number">`.

- [ ] **Step 4: Añadir la ruta a la navegación**

En `src/components/nav-items.ts`, antes de la línea de `/development/habits`:

```ts
  { href: "/development/goals", label: "Metas Personales", group: "Personal Development OS", icon: "personalGoals", color: "var(--c-orange)" },
```

- [ ] **Step 5: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit
```

Esperado: todo en verde.

- [ ] **Step 6: Verificar en la app real**

```bash
pnpm dev
```

En `/development/goals`: crear la meta "Leer 24 libros" con horizonte `2026-12-31`; añadirle un resultado clave con fuente **libro** apuntando a un libro con páginas leídas y verificar que la barra refleja las páginas sin haber capturado nada. Añadir un segundo resultado clave manual y comprobar que el porcentaje de la meta es el promedio de ambos. Borrar el libro desde `/development/library` y recargar: el resultado clave debe mostrar "fuente eliminada", no 0 %.

- [ ] **Step 7: Actualizar el UX_MAP y commitear**

Añadir en `docs/UX_MAP.md`:

```markdown
| Metas Personales | `/development/goals` | `development/goals/page.tsx` | `personal_goals`,`key_results` + fuentes (`habits`,`habit_logs`,`projects`,`tasks`,`books`,`financial_goals`) | `upsertPersonalGoal`,`deletePersonalGoal`,`upsertKeyResult`,`deleteKeyResult` |
```

```bash
git add -A
git commit -m "Medir metas personales con datos que ya están en la base

Cada resultado clave apunta a un hábito, un proyecto personal, un libro o una
meta financiera, y su avance se lee de ahí. Los proyectos se filtran a
workspace_id is null en el servidor: un resultado clave nunca puede medirse
contra el trabajo de un equipo (BR-012)."
```

---

### Task 5: Dominio de rutinas — orden de pasos sin duplicar racha ni horario

**Files:**
- Create: `src/lib/domain/development/routines.ts`
- Test: `tests/domain/development-routines.test.ts`

**Interfaces:**
- Consumes: `addDaysISO`, `diffDays` de `@/lib/domain/datetime.ts`.
- Produces:
  - `type Frequency = "Diario" | "Semanal" | "Entre semana" | "Fin de semana"`
  - `interface StepLike { id: string; durationMin: number }`
  - `routineDueToday(frequency: Frequency, dateISO: string): boolean`
  - `routineProgress(completedStepIds: string[], steps: StepLike[]): { done: number; total: number; pct: number; remainingMin: number }`
  - `routineFitsBlock(steps: StepLike[], block: { start: string; end: string } | null): boolean`
  - `routineAdherence(completedRunDates: string[], frequency: Frequency, fromISO: string, toISO: string): number`
  - `nextCompletedSteps(current: string[], stepId: string): string[]`
  - `type HabitLogEffect = "insert" | "noop"`
  - `habitLogEffect(habitId: string | null, willBeDone: boolean, alreadyLoggedToday: boolean): HabitLogEffect`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/domain/development-routines.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  routineDueToday,
  routineProgress,
  routineFitsBlock,
  routineAdherence,
  nextCompletedSteps,
  habitLogEffect
} from "../../src/lib/domain/development/routines.ts";

// 2026-08-22 es sábado; 2026-08-24 es lunes; 2026-08-26 es miércoles.

test("routineDueToday: Diario toca todos los días", () => {
  assert.strictEqual(routineDueToday("Diario", "2026-08-22"), true);
  assert.strictEqual(routineDueToday("Diario", "2026-08-24"), true);
});

test("routineDueToday: Entre semana excluye sábado y domingo", () => {
  assert.strictEqual(routineDueToday("Entre semana", "2026-08-22"), false); // sábado
  assert.strictEqual(routineDueToday("Entre semana", "2026-08-26"), true);  // miércoles
});

test("routineDueToday: Fin de semana es solo sábado y domingo", () => {
  assert.strictEqual(routineDueToday("Fin de semana", "2026-08-22"), true);
  assert.strictEqual(routineDueToday("Fin de semana", "2026-08-26"), false);
});

test("routineDueToday: Semanal se ancla al lunes", () => {
  assert.strictEqual(routineDueToday("Semanal", "2026-08-24"), true);
  assert.strictEqual(routineDueToday("Semanal", "2026-08-26"), false);
});

test("routineProgress: cuenta pasos hechos y minutos que faltan", () => {
  const steps = [
    { id: "s1", durationMin: 10 },
    { id: "s2", durationMin: 15 },
    { id: "s3", durationMin: 5 }
  ];
  assert.deepStrictEqual(routineProgress(["s1"], steps), { done: 1, total: 3, pct: 33, remainingMin: 20 });
});

test("routineProgress: una rutina sin pasos va en 0, no en NaN", () => {
  assert.deepStrictEqual(routineProgress([], []), { done: 0, total: 0, pct: 0, remainingMin: 0 });
});

test("routineProgress: ignora ids de pasos que ya no existen", () => {
  const steps = [{ id: "s1", durationMin: 10 }];
  assert.strictEqual(routineProgress(["s1", "s-borrado"], steps).done, 1);
});

test("routineFitsBlock: 30 min de pasos no caben en un bloque de 20", () => {
  const steps = [{ id: "s1", durationMin: 20 }, { id: "s2", durationMin: 10 }];
  assert.strictEqual(routineFitsBlock(steps, { start: "06:00", end: "06:20" }), false);
  assert.strictEqual(routineFitsBlock(steps, { start: "06:00", end: "07:00" }), true);
});

test("routineFitsBlock: sin bloque anclado no hay conflicto posible", () => {
  assert.strictEqual(routineFitsBlock([{ id: "s1", durationMin: 999 }], null), true);
});

test("routineAdherence: 3 de 5 días entre semana cumplidos = 60%", () => {
  // 2026-08-24 (lun) a 2026-08-28 (vie): 5 días que tocan
  const done = ["2026-08-24", "2026-08-25", "2026-08-27"];
  assert.strictEqual(routineAdherence(done, "Entre semana", "2026-08-24", "2026-08-28"), 60);
});

test("routineAdherence: un rango donde la rutina nunca toca devuelve 0, no divide entre cero", () => {
  assert.strictEqual(routineAdherence([], "Fin de semana", "2026-08-24", "2026-08-26"), 0);
});

test("nextCompletedSteps: alterna sin duplicar", () => {
  assert.deepStrictEqual(nextCompletedSteps([], "s1"), ["s1"]);
  assert.deepStrictEqual(nextCompletedSteps(["s1"], "s1"), []);
  assert.deepStrictEqual(nextCompletedSteps(["s1"], "s2"), ["s1", "s2"]);
});

test("habitLogEffect: marcar un paso ligado a un hábito no marcado hoy lo inserta", () => {
  assert.strictEqual(habitLogEffect("h1", true, false), "insert");
});

test("habitLogEffect: si el hábito ya se marcó hoy no se duplica la fila", () => {
  assert.strictEqual(habitLogEffect("h1", true, true), "noop");
});

test("habitLogEffect: desmarcar el paso NO desmarca el hábito", () => {
  assert.strictEqual(habitLogEffect("h1", false, true), "noop");
});

test("habitLogEffect: un paso sin hábito ligado no toca habit_logs", () => {
  assert.strictEqual(habitLogEffect(null, true, false), "noop");
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
pnpm test:unit
```

Esperado: FALLA con `Cannot find module .../development/routines.ts`.

- [ ] **Step 3: Escribir la implementación mínima**

```ts
// src/lib/domain/development/routines.ts
// Rutinas — lógica pura, sin React ni Supabase (probada en
// tests/domain/development-routines.test.ts).
//
// LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO
// No guarda horarios: el bloque sigue viviendo en `occupations`. No calcula
// rachas: siguen viviendo en `habit_logs`. Una rutina solo aporta el ORDEN de
// los pasos y el puente hacia el hábito que ya existe.

import { addDaysISO, diffDays } from "../datetime.ts";

export type Frequency = "Diario" | "Semanal" | "Entre semana" | "Fin de semana";

export interface StepLike {
  id: string;
  durationMin: number;
}

/**
 * Mismos cuatro valores que `habits.frequency`. "Semanal" se ancla al lunes:
 * una rutina semanal necesita un día concreto para poder medir adherencia, y
 * el lunes es el arranque de semana que ya usa /planning.
 */
export function routineDueToday(frequency: Frequency, dateISO: string): boolean {
  const dow = new Date(`${dateISO}T00:00:00Z`).getUTCDay(); // 0 = domingo
  switch (frequency) {
    case "Diario":
      return true;
    case "Semanal":
      return dow === 1;
    case "Entre semana":
      return dow >= 1 && dow <= 5;
    case "Fin de semana":
      return dow === 0 || dow === 6;
  }
}

export function routineProgress(
  completedStepIds: string[],
  steps: StepLike[]
): { done: number; total: number; pct: number; remainingMin: number } {
  const done = new Set(completedStepIds);
  const hechos = steps.filter((s) => done.has(s.id));
  return {
    done: hechos.length,
    total: steps.length,
    pct: steps.length === 0 ? 0 : Math.round((hechos.length / steps.length) * 100),
    remainingMin: steps.filter((s) => !done.has(s.id)).reduce((sum, s) => sum + s.durationMin, 0)
  };
}

function toMinutes(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** ¿Cabe la rutina en el bloque al que está anclada? Sin bloque, siempre cabe. */
export function routineFitsBlock(steps: StepLike[], block: { start: string; end: string } | null): boolean {
  if (block === null) return true;
  const total = steps.reduce((sum, s) => sum + s.durationMin, 0);
  return total <= toMinutes(block.end) - toMinutes(block.start);
}

/** % de días que tocaban en el rango y sí se ejecutaron. */
export function routineAdherence(
  completedRunDates: string[],
  frequency: Frequency,
  fromISO: string,
  toISO: string
): number {
  const done = new Set(completedRunDates);
  let due = 0;
  let hit = 0;
  for (let d = fromISO; diffDays(d, toISO) >= 0; d = addDaysISO(d, 1)) {
    if (!routineDueToday(frequency, d)) continue;
    due++;
    if (done.has(d)) hit++;
  }
  return due === 0 ? 0 : Math.round((hit / due) * 100);
}

export function nextCompletedSteps(current: string[], stepId: string): string[] {
  return current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId];
}

export type HabitLogEffect = "insert" | "noop";

/**
 * El puente que evita duplicar la racha. Dos reglas deliberadas:
 *  - Si el hábito ya se marcó hoy (desde /development/habits o desde otra
 *    rutina), no se inserta otra vez: `habit_logs` es único por
 *    (habit_id, log_date) y marcar dos veces no debe reventar.
 *  - Desmarcar el paso NO desmarca el hábito. El usuario pudo haberlo
 *    cumplido por otra vía, y borrar su racha desde aquí sería destruir un
 *    dato que esta rutina no es dueña de negar.
 */
export function habitLogEffect(habitId: string | null, willBeDone: boolean, alreadyLoggedToday: boolean): HabitLogEffect {
  if (habitId === null) return "noop";
  if (!willBeDone) return "noop";
  return alreadyLoggedToday ? "noop" : "insert";
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
pnpm test:unit
```

Esperado: los 16 tests nuevos en verde, sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/development/routines.ts tests/domain/development-routines.test.ts
git commit -m "Ejecutar rutinas sin duplicar el horario ni la racha

Una rutina solo aporta el orden de los pasos: el bloque sigue en occupations
y la racha sigue en habit_logs. habitLogEffect codifica las dos reglas del
puente — no duplicar si el hábito ya se marcó hoy, y no desmarcarlo al
desmarcar el paso."
```

---

### Task 6: Rutinas — acciones y vista con ejecución del día

**Files:**
- Create: `src/app/(app)/development/routines/{page.tsx,actions.ts,RoutineForm.tsx,RoutineRunner.tsx}`
- Modify: `src/components/nav-items.ts`
- Modify: `docs/UX_MAP.md`

**Interfaces:**
- Consumes: `routineDueToday`, `routineProgress`, `routineFitsBlock`, `routineAdherence`, `nextCompletedSteps`, `habitLogEffect` (Task 5).
- Produces: Server Actions `upsertRoutine(id, formData)`, `deleteRoutine(id)`, `upsertRoutineStep(routineId, id, formData)`, `deleteRoutineStep(id)`, `toggleRoutineStep(routineId, stepId)`.

- [ ] **Step 1: Escribir las Server Actions de CRUD**

```ts
// src/app/(app)/development/routines/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { nextCompletedSteps, habitLogEffect } from "@/lib/domain/development/routines.ts";

const routineSchema = z.object({
  name: z.string().min(1),
  frequency: z.enum(["Diario", "Semanal", "Entre semana", "Fin de semana"]),
  occupationId: z.string().uuid().optional().or(z.literal("")),
  active: z.coerce.boolean().default(true)
});

export async function upsertRoutine(id: string | null, formData: FormData) {
  const parsed = routineSchema.parse({
    name: formData.get("name"),
    frequency: formData.get("frequency"),
    occupationId: formData.get("occupationId") ?? "",
    active: formData.get("active") === "on" || formData.get("active") === "true"
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    name: parsed.name,
    frequency: parsed.frequency,
    occupation_id: parsed.occupationId || null,
    active: parsed.active
  };

  if (id) {
    const { error } = await supabase.from("routines").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("routines").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/development/routines");
  revalidatePath("/development");
}

export async function deleteRoutine(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("routines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/routines");
  revalidatePath("/development");
}

const stepSchema = z.object({
  title: z.string().min(1),
  durationMin: z.coerce.number().int().min(1).default(5),
  habitId: z.string().uuid().optional().or(z.literal("")),
  position: z.coerce.number().int().min(0).default(0)
});

export async function upsertRoutineStep(routineId: string, id: string | null, formData: FormData) {
  const parsed = stepSchema.parse({
    title: formData.get("title"),
    durationMin: formData.get("durationMin") ?? 5,
    habitId: formData.get("habitId") ?? "",
    position: formData.get("position") ?? 0
  });

  const supabase = await createClient();
  const payload = {
    title: parsed.title,
    duration_min: parsed.durationMin,
    habit_id: parsed.habitId || null,
    position: parsed.position
  };

  if (id) {
    const { error } = await supabase.from("routine_steps").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("routine_steps").insert({ ...payload, routine_id: routineId });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/development/routines");
  revalidatePath("/development");
}

export async function deleteRoutineStep(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("routine_steps").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/routines");
  revalidatePath("/development");
}
```

- [ ] **Step 2: Escribir el puente hacia `habit_logs`**

Añadir al final del mismo archivo:

```ts
/**
 * Marca/desmarca un paso de la ejecución de HOY. Cuando el paso está ligado a
 * un hábito, la decisión de tocar `habit_logs` la toma `habitLogEffect` —
 * función pura y probada— y esta acción solo la ejecuta.
 */
export async function toggleRoutineStep(routineId: string, stepId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const today = todayLocal(await getUserTimeZone());

  const [{ data: run }, { data: step }, { data: steps }] = await Promise.all([
    supabase.from("routine_runs").select("id, completed_step_ids").eq("routine_id", routineId).eq("local_date", today).maybeSingle(),
    supabase.from("routine_steps").select("habit_id").eq("id", stepId).single(),
    supabase.from("routine_steps").select("id").eq("routine_id", routineId)
  ]);

  const current = run?.completed_step_ids ?? [];
  const next = nextCompletedSteps(current, stepId);
  const willBeDone = next.includes(stepId);
  const allDone = (steps ?? []).length > 0 && next.length >= (steps ?? []).length;

  // upsert con onConflict: dos clics simultáneos no crean dos ejecuciones del
  // mismo día — el índice único (routine_id, local_date) lo resuelve en la base.
  const { error } = await supabase
    .from("routine_runs")
    .upsert(
      { routine_id: routineId, local_date: today, completed_step_ids: next, completed_at: allDone ? new Date().toISOString() : null },
      { onConflict: "routine_id,local_date" }
    );
  if (error) throw new Error(error.message);

  const habitId = step?.habit_id ?? null;
  if (habitId) {
    const { data: log } = await supabase.from("habit_logs").select("id").eq("habit_id", habitId).eq("log_date", today).maybeSingle();
    if (habitLogEffect(habitId, willBeDone, Boolean(log)) === "insert") {
      await supabase.from("habit_logs").insert({ habit_id: habitId, log_date: today });
      await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.complete", object: habitId });
    }
  }

  revalidatePath("/development/routines");
  revalidatePath("/development/habits");
  revalidatePath("/development");
  revalidatePath("/home");
}
```

- [ ] **Step 3: Escribir la página**

`src/app/(app)/development/routines/page.tsx` — Server Component:

1. Sesión y redirect, igual que las demás páginas.
2. `Promise.all` de: `routines` (order `position`), `routine_steps`, `occupations` (id, title, start_time, end_time), `habits` (id, name), y `routine_runs` de los últimos 30 días (`.gte("local_date", addDaysISO(today, -29))`).
3. `const today = todayLocal(await getUserTimeZone())`.
4. Por rutina: `routineDueToday(r.frequency, today)`, el run de hoy, `routineProgress(run?.completed_step_ids ?? [], steps)`, `routineFitsBlock(steps, block)` con el bloque de su ocupación, y `routineAdherence(runsCompletados, r.frequency, addDaysISO(today, -29), today)`.
5. Render: las rutinas que tocan hoy arriba, cada una con `<Progress>`, chip de minutos restantes, chip `warn` "No cabe en el bloque" cuando `routineFitsBlock` es falso, y chip de adherencia de 30 días. Las que no tocan hoy van en una sección "Otras rutinas" atenuada.
6. `<EmptyState icon="🔁" text="Crea tu primera rutina. Ánclala a un bloque de tu Autogestión del Tiempo y sus pasos pueden ser hábitos que ya llevas." />`.

`RoutineRunner.tsx` es un Client Component que recibe `{ routineId, steps, completedStepIds, today }` y renderiza un checkbox por paso; al cambiar, llama `toggleRoutineStep` dentro de `useTransition` con `try/catch` para el error inline. **`today` llega como prop desde el servidor** — el cliente nunca calcula la fecha (D-018).

`RoutineForm.tsx` sigue el patrón de `HabitForm.tsx`, con el `<select name="occupationId">` de ocupaciones y, dentro de la rutina abierta, los campos de paso (`title`, `durationMin`, `<select name="habitId">` con "— sin ligar —").

- [ ] **Step 4: Añadir la ruta a la navegación**

En `src/components/nav-items.ts`, después de la línea de `/development/goals`:

```ts
  { href: "/development/routines", label: "Rutinas", group: "Personal Development OS", icon: "routines", color: "var(--c-orange)" },
```

- [ ] **Step 5: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit
```

- [ ] **Step 6: Verificar el puente en la app real**

```bash
pnpm dev
```

Esta es **la comprobación que justifica el diseño de rutinas**, hazla completa:

1. En `/development/habits`, anota la racha actual del hábito "Meditar" y **no** lo marques.
2. En `/time`, crea una ocupación "Mañana" de 06:00 a 07:00.
3. En `/development/routines`, crea "Rutina matutina" anclada a esa ocupación, con un paso "Meditar 10 min" ligado al hábito "Meditar".
4. Marca el paso. Ve a `/development/habits`: el hábito debe aparecer cumplido hoy y su racha subida en 1.
5. Vuelve y **desmarca** el paso. El hábito debe seguir cumplido — desmarcar el paso no borra la racha.
6. Marca el paso otra vez y recarga: debe seguir habiendo **una sola** marca de hoy, no dos.
7. Añade pasos que sumen más de 60 minutos: debe aparecer el chip "No cabe en el bloque".

- [ ] **Step 7: Actualizar el UX_MAP y commitear**

```markdown
| Rutinas | `/development/routines` | `development/routines/page.tsx` | `routines`,`routine_steps`,`routine_runs`,`occupations`,`habits` | `upsertRoutine`,`deleteRoutine`,`upsertRoutineStep`,`deleteRoutineStep`,`toggleRoutineStep` |
```

```bash
git add -A
git commit -m "Ejecutar la rutina del día y cerrar los hábitos que la componen

Completar un paso ligado a un hábito escribe en habit_logs por un camino
idempotente, así la racha de /development/habits no se bifurca. El upsert con
onConflict deja que el índice único (routine_id, local_date) resuelva dos
clics simultáneos."
```

---

### Task 7: Panel `/development`

Cierra la fase: la vista que responde "¿qué me toca hoy y cómo van mis metas?" en una pantalla.

**Files:**
- Create: `src/app/(app)/development/page.tsx`
- Modify: `src/components/nav-items.ts`
- Modify: `docs/UX_MAP.md`, `README.md`

**Interfaces:**
- Consumes: todo lo producido por las tareas 3, 4, 5 y 6, más `loadSourceSnapshot` de `src/lib/data/development.ts`.
- Produces: la ruta `/development`.

- [ ] **Step 1: Escribir la página**

Server Component que reúne lo ya construido, sin lógica nueva:

1. Sesión y redirect.
2. `const today = todayLocal(await getUserTimeZone())` y `const sources = await loadSourceSnapshot()`.
3. `Promise.all` de: `personal_goals` con `status = 'Activa'`, sus `key_results`, `routines` con `active = true`, sus `routine_steps`, y los `routine_runs` de hoy.
4. Tres secciones:
   - **Rutina de hoy** — solo las rutinas donde `routineDueToday(r.frequency, today)`, cada una con su `routineProgress` y sus minutos restantes. `<EmptyState icon="🔁" text="Hoy no toca ninguna rutina." />` si no hay.
   - **Metas activas** — cada meta con `goalProgress` y su chip `bad` "En riesgo" cuando `goalAtRisk` es verdadero, ordenadas con las en riesgo primero.
   - **Fila de `<Stat>`** — metas activas, metas en riesgo, adherencia media de rutinas hoy.
5. `<EmptyState icon="🌱" text="Empieza definiendo una meta personal o una rutina." />` cuando no hay ni metas ni rutinas.

- [ ] **Step 2: Añadir la ruta como primer item del grupo**

En `src/components/nav-items.ts`, **antes** de `/development/goals`:

```ts
  { href: "/development", label: "Panel", group: "Personal Development OS", icon: "development", color: "var(--c-orange)" },
```

- [ ] **Step 3: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit
```

- [ ] **Step 4: Verificar la fase completa**

```bash
pnpm verify
```

Esperado: install, typecheck, lint, tests unitarios, build, `supabase db reset` y `supabase db test` **todos en verde**. Si algo falla, es un bloqueante de la fase — no commitear encima.

Después, con `pnpm dev`, recorrer `/development` y comprobar que la rutina marcada en la Task 6 aparece con su progreso y que una meta con horizonte cercano y poco avance muestra el chip "En riesgo".

- [ ] **Step 5: Documentar el módulo**

En `README.md`, en la sección de privacidad, añadir el módulo a la lista de lo que es siempre privado:

```markdown
Money OS (…) y la planeación personal (Hoy, ocupaciones, rango de actividad,
hábitos, lectura, **metas personales y rutinas**) son **siempre privados**…
```

En `docs/UX_MAP.md` añadir:

```markdown
| Panel de Desarrollo Personal | `/development` | `development/page.tsx` | `personal_goals`,`key_results`,`routines`,`routine_steps`,`routine_runs` | Lectura agregada |
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Reunir metas y rutinas en el panel del módulo

Una pantalla que responde qué toca hoy y cómo van las metas activas, sin
lógica propia: solo compone lo que ya calculan goals.ts y routines.ts."
```

---

## Qué queda fuera de esta fase

Está en el spec y llega después. No lo implementes aquí:

- **Sistemas** (plantillas instanciables) — Fase 2, migración `0025`.
- **Wishlist y compras** — Fase 3, migración `0026`.
- **Integraciones externas** (Open Library, Readwise, Google Calendar, Strava/Fitbit) — Fase 4, migración `0027` + Vault + cambios de CSP.
- **Extractor `development` para Intelligence OS** — Fase 5.
- **Columnas `source`/`external_id` en `book_notes`** — pertenecen a la Fase 4, que es quien importa notas de fuera. Añadirlas antes es una migración sin consumidor.
