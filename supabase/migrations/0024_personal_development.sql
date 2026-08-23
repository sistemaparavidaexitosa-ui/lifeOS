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
