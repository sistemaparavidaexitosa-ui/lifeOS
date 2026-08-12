-- 0009_audit.sql
-- Auditoría append-only (§34.1: "Consultar auditoría: Propia limitada").
-- Cada usuario puede LEER e INSERTAR sus propias filas; no existen políticas
-- de UPDATE/DELETE para `authenticated` → append-only real a nivel RLS.
-- Nota (§4bis): esquemas verdaderamente sensibles (webhooks/OTP) usarían un
-- esquema `private` otorgado solo a service_role; este audit_log es de
-- usuario final y por eso vive en `public` con RLS restrictiva, consistente
-- con el resto del modelo de aislamiento por user_id.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  object text,
  correlation_id text not null default substr(gen_random_uuid()::text, 1, 12),
  meta jsonb,
  created_at timestamptz not null default now()
);
comment on table public.audit_log is 'Append-only: sin políticas UPDATE/DELETE para authenticated. Ver /docs/SECURITY.md.';

create index if not exists idx_audit_log_user on public.audit_log(user_id, created_at desc);

alter table public.audit_log enable row level security;

-- Solo SELECT e INSERT — nunca UPDATE/DELETE (append-only real).
create policy audit_log_select_own on public.audit_log for select using (user_id = auth.uid());
create policy audit_log_insert_own on public.audit_log for insert with check (user_id = auth.uid());

grant select, insert on public.audit_log to anon, authenticated;
grant all privileges on public.audit_log to service_role;
