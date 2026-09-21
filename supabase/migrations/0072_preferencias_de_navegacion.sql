-- 0072 · Dónde has estado, para aprender tu ritmo (D-183)
--
-- POR QUÉ UNA TABLA Y NO `audit_log`
-- `audit_log` tiene exactamente la forma que hace falta y sería gratis usarlo.
-- No se usa por una razón: es APPEND-ONLY a propósito (0009, solo tiene
-- políticas de select e insert). Es un rastro de auditoría, y un rastro de
-- auditoría que se puede borrar no sirve para auditar.
--
-- Pero esto NO es auditoría: es un historial de por dónde navegas, con la ruta
-- completa. En este repositorio la regla para lo que el sistema cree saber de
-- ti es que puedas verlo y borrarlo —es el motivo por el que la memoria es
-- `memory_items` editable y no un almacén de vectores—. Meterlo en `audit_log`
-- significaría que tu historial de navegación es inmutable para siempre.
--
-- Así que tabla propia, con DELETE para su dueño.

create table if not exists public.nav_visitas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- La ruta tal cual, con sus parámetros. Es una decisión del dueño del
  -- sistema (2026-09-20): permite aprender a nivel de proyecto o de ticker,
  -- y a cambio queda escrito a qué entraste. Por eso hay que poder borrarlo.
  ruta       text not null,
  -- El mismo vocabulario que `centro_runs`: un solo calendario para el día.
  franja     text not null check (franja in ('manana', 'tarde', 'noche')),
  -- El día LOCAL de la persona, no el del servidor. En Vercel el proceso corre
  -- en UTC y a la una de la tarde en México diría que es otro día.
  local_date date not null,
  created_at timestamptz not null default now()
);

-- La consulta que de verdad se hace: las visitas de alguien en una ventana de
-- días, para deducir su ritmo. Nunca se busca por ruta sin usuario.
create index if not exists idx_nav_visitas_user_fecha
  on public.nav_visitas (user_id, local_date desc);

alter table public.nav_visitas enable row level security;

drop policy if exists nav_visitas_own on public.nav_visitas;
create policy nav_visitas_own on public.nav_visitas
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE incluido, que es la diferencia con `audit_log` y el motivo de existir
-- de esta tabla.
grant select, insert, delete on public.nav_visitas to authenticated;
grant all privileges on public.nav_visitas to service_role;
revoke all on public.nav_visitas from anon;

comment on table public.nav_visitas is
  'Por dónde navega la persona, para aprender su ritmo (D-183). Suya: puede verlo y borrarlo, al contrario que audit_log, que es append-only.';
