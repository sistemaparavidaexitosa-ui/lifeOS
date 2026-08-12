-- 0006_household.sql
-- Hogar y Dependientes Económicos — FR-MNY-013…017, BR-020/021, ADR-011.
-- NO es un rol de workspace (§34.3): gestión privada y exclusiva del titular.
-- family_member NO es un usuario autenticado (A-008, NG-009) — sin login propio.

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, -- titular
  name text not null,
  relationship text not null check (relationship in ('Cónyuge', 'Hijo/a', 'Padre', 'Madre', 'Otro')),
  member_type text not null default 'Dependiente' check (member_type in ('Adulto', 'Dependiente')),
  created_at timestamptz not null default now()
);
comment on table public.family_members is 'FR-MNY-013: miembro de hogar gestionado por el titular. Nunca se comparte con un Workspace (BR-020, FR-MNY-017).';

create index if not exists idx_family_members_user on public.family_members(user_id);

-- Ahora que family_members existe, añadimos la columna de atribución en
-- journal_entries (creada en 0005) — BR-021: opcional, sin miembro = titular/hogar general.
alter table public.journal_entries
  add constraint fk_journal_entries_family_member foreign key (family_member_id) references public.family_members(id) on delete set null;

create index if not exists idx_journal_entries_family_member on public.journal_entries(family_member_id);

-- =============================================================================
-- RLS: privado y exclusivo del titular (NFR-PRV-003)
-- =============================================================================
alter table public.family_members enable row level security;
create policy family_members_own on public.family_members for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- GRANTS (F9 🔴)
-- =============================================================================
grant select on public.family_members to anon, authenticated;
grant insert, update, delete on public.family_members to authenticated;
grant all privileges on public.family_members to service_role;
