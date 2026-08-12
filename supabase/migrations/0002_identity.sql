-- 0002_identity.sql
-- FR-IAM-001/002/003, FR-USR-001/002/003. Perfil 1:1 con auth.users; nunca se
-- comparte con ningún workspace (BR-012).

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  currency text not null default 'MXN',
  timezone text not null default 'America/Mexico_City',
  locale text not null default 'es-MX',
  cycle text not null default 'Quincenal' check (cycle in ('Quincenal', 'Mensual', 'Semanal')),
  onboarded boolean not null default false,
  activity_window_start time not null default '05:00',
  activity_window_end time not null default '21:00',
  theme text not null default 'light' check (theme in ('light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'FR-USR-001: perfil, moneda base, timezone, locale y ciclo de ingresos. Privado (BR-012).';

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null,
  version text not null default '1.0',
  status text not null check (status in ('granted', 'denied')),
  ts timestamptz not null default now(),
  unique (user_id, purpose)
);
comment on table public.consents is 'FR-USR-003: consentimiento por propósito y versión.';

-- ---------------------------------------------------------------------------
-- RLS: estrictamente por user_id (BR-012). Ningún rol de workspace alcanza
-- estas tablas.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.consents enable row level security;

create policy profiles_select_own on public.profiles for select using (user_id = auth.uid());
create policy profiles_insert_own on public.profiles for insert with check (user_id = auth.uid());
create policy profiles_update_own on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_delete_own on public.profiles for delete using (user_id = auth.uid());

create policy consents_select_own on public.consents for select using (user_id = auth.uid());
create policy consents_insert_own on public.consents for insert with check (user_id = auth.uid());
create policy consents_update_own on public.consents for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- GRANTS (F9 🔴): RLS filtra FILAS; GRANT decide si el rol puede TOCAR la
-- tabla. Sin esto, cualquier SELECT/INSERT devuelve "permission denied".
-- ---------------------------------------------------------------------------
grant select on public.profiles, public.consents to anon, authenticated;
grant insert, update, delete on public.profiles, public.consents to authenticated;
grant all privileges on public.profiles, public.consents to service_role;

-- ---------------------------------------------------------------------------
-- Trigger: crear fila de profiles automáticamente al registrarse (Supabase
-- Auth). Evita el bug "la app conecta pero no hay datos" (F10) para el perfil.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant select on tables to anon, authenticated;
alter default privileges in schema public grant insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
