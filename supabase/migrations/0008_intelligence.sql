-- 0008_intelligence.sql
-- Intelligence OS — FR-INT-001…011. Recomendaciones, memoria y
-- automatizaciones son privadas por user_id. FR-INT-009: en proyectos
-- compartidos, la IA nunca usa datos de Money OS/Time/Habits de ningún
-- miembro — por eso estas tablas NUNCA se referencian desde has_project_access.

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  text text not null,
  confidence text not null check (confidence in ('Alta', 'Media', 'Baja')),
  domain text not null,
  evidence jsonb not null default '[]',
  assumptions jsonb not null default '[]',
  actions jsonb not null default '[]',
  requires_confirmation boolean not null default false,
  impact text not null default 'Medio',
  status text not null default 'Presented' check (status in ('Presented', 'Suppressed', 'Accepted', 'Edited', 'Dismissed', 'Reported', 'Applied')),
  created_at timestamptz not null default now()
);
comment on table public.recommendations is 'FR-INT-002/003: evidencia + supuestos + acción propuesta. BR-007/018/022: nunca se auto-aplica.';

create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('goal', 'project', 'finance', 'decision', 'preference', 'time', 'habit')),
  origin text not null default 'user',
  text text not null,
  valid_until date,
  created_at timestamptz not null default now()
);
comment on table public.memory_items is 'FR-INT-006: memoria visible, editable y eliminable por el usuario.';

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trigger_text text not null,
  condition_text text not null default '',
  action_text text not null default '',
  authorized boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.automations is 'FR-AUT-001/002: acciones de impacto siempre requieren confirmación.';

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  result text not null,
  ts timestamptz not null default now()
);

create index if not exists idx_recommendations_user_status on public.recommendations(user_id, status);
create index if not exists idx_memory_items_user on public.memory_items(user_id);
create index if not exists idx_automations_user on public.automations(user_id);
create index if not exists idx_automation_runs_automation on public.automation_runs(automation_id);

alter table public.recommendations enable row level security;
alter table public.memory_items enable row level security;
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;

create policy recommendations_own on public.recommendations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy memory_items_own on public.memory_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy automations_own on public.automations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy automation_runs_own on public.automation_runs for all
  using (exists (select 1 from public.automations a where a.id = automation_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.automations a where a.id = automation_id and a.user_id = auth.uid()));

grant select on public.recommendations, public.memory_items, public.automations, public.automation_runs to anon, authenticated;
grant insert, update, delete on public.recommendations, public.memory_items, public.automations, public.automation_runs to authenticated;
grant all privileges on public.recommendations, public.memory_items, public.automations, public.automation_runs to service_role;
