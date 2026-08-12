-- 0004_planning_time_habits.sql
-- Planeación (Hoy/Semana), Autogestión del Tiempo y Hábitos/Lectura.
-- BR-012/019/027: TODAS estas tablas son privadas por user_id, SIN
-- workspace_id y SIN relación con has_project_access. Ningún rol de
-- workspace puede alcanzarlas (NFR-PRV-002/004/005).

-- =============================================================================
-- DAILY PLANS / WEEKLY REVIEWS — FR-PLN-002/004/005/008
-- =============================================================================
create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  one_thing text not null default '',
  one_thing_task_id uuid,
  one_thing_project_id uuid,
  task_ids uuid[] not null default '{}',
  approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);
comment on table public.daily_plans is 'FR-PLN-002/008: Única Cosa definida con flujo jerárquico proyecto->tarea. Privado (BR-012).';

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_date date not null default current_date,
  completed_count integer not null default 0,
  progress_pct integer not null default 0,
  blocked_count integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.weekly_reviews is 'FR-PLN-005: snapshot inmutable de la revisión semanal (BR-004).';

-- =============================================================================
-- TIME SELF-MANAGEMENT — FR-TIM-001…008
-- =============================================================================
create table if not exists public.occupations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_time time not null,
  end_time time not null,
  category text not null default 'Trabajo' check (category in ('Trabajo', 'Familia', 'Personal', 'Salud', 'Descanso', 'Otros')),
  recurring boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
comment on table public.occupations is 'FR-TIM-001: privado por user_id, igual que daily_plans (BR-019).';

-- =============================================================================
-- HABITS / READING — FR-HAB-001…006, FR-HOM-007
-- =============================================================================
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  frequency text not null default 'Diario' check (frequency in ('Diario', 'Semanal', 'Entre semana', 'Fin de semana')),
  category text not null default 'Salud' check (category in ('Salud', 'Aprendizaje', 'Trabajo', 'Personal', 'Otros')),
  occupation_id uuid references public.occupations(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.habits is 'FR-HAB-001: hábito opcionalmente ligado a una ocupación. Privado (BR-027).';

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  log_date date not null,
  completed_at timestamptz not null default now(),
  unique (habit_id, log_date)
);
comment on table public.habit_logs is 'FR-HAB-002: registro append-only usado para calcular la racha (streak).';

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  author text not null default '',
  status text not null default 'Por leer' check (status in ('Por leer', 'Leyendo', 'Terminado')),
  current_page integer not null default 0,
  total_pages integer not null default 0,
  started_at date,
  finished_at date,
  updated_at timestamptz not null default now()
);
comment on table public.books is 'FR-HAB-003: biblioteca de lectura. Privado (BR-027).';

create table if not exists public.book_notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  page_ref integer not null default 0,
  text text not null,
  created_at timestamptz not null default now()
);
comment on table public.book_notes is 'FR-HAB-004: notas de lectura asociadas a una página/capítulo.';

-- =============================================================================
-- Índices
-- =============================================================================
create index if not exists idx_daily_plans_user_date on public.daily_plans(user_id, local_date desc);
create index if not exists idx_occupations_user on public.occupations(user_id);
create index if not exists idx_habits_user on public.habits(user_id);
create index if not exists idx_habit_logs_habit_date on public.habit_logs(habit_id, log_date desc);
create index if not exists idx_books_user_status on public.books(user_id, status);
create index if not exists idx_book_notes_book on public.book_notes(book_id);

-- =============================================================================
-- Trigger: eliminar una ocupación NO borra hábitos ligados (FR-HAB-006, BR-026)
-- =============================================================================
-- La FK ya usa `on delete set null` en habits.occupation_id, lo que satisface
-- FR-HAB-006/BR-026 automáticamente a nivel de base de datos: el hábito
-- permanece con occupation_id = null tras eliminar la ocupación.

-- =============================================================================
-- RLS: TODAS estas tablas son privadas por user_id (BR-012/019/027)
-- =============================================================================
alter table public.daily_plans enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.occupations enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.books enable row level security;
alter table public.book_notes enable row level security;

create policy daily_plans_own on public.daily_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy weekly_reviews_own on public.weekly_reviews for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy occupations_own on public.occupations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy habits_own on public.habits for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy habit_logs_own on public.habit_logs for all
  using (exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()))
  with check (exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
create policy books_own on public.books for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy book_notes_own on public.book_notes for all
  using (exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid()));

-- =============================================================================
-- GRANTS (F9 🔴)
-- =============================================================================
grant select on public.daily_plans, public.weekly_reviews, public.occupations, public.habits,
  public.habit_logs, public.books, public.book_notes to anon, authenticated;
grant insert, update, delete on public.daily_plans, public.weekly_reviews, public.occupations, public.habits,
  public.habit_logs, public.books, public.book_notes to authenticated;
grant all privileges on public.daily_plans, public.weekly_reviews, public.occupations, public.habits,
  public.habit_logs, public.books, public.book_notes to service_role;
