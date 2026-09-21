-- 0073 · La watchlist de Money OS (D-184)
--
-- La primera tabla del producto que guarda referencias a algo de FUERA. Hasta
-- ahora todo lo que LifeOS sabe salió de LifeOS; un ticker es un puntero a un
-- mercado que no controlamos.
--
-- POR QUÉ NO SE GUARDAN PRECIOS
-- Se guarda QUÉ sigues, nunca CUÁNTO vale. Un precio en la base envejece en
-- segundos y sería una cifra que el sistema podría enseñar como propia sin
-- poder responder por ella — justo lo que `validateAnchoring` existe para
-- impedir en el otro extremo. Los precios se piden a Polygon en cada lectura o
-- no se enseñan.

create table if not exists public.watchlist (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Normalizado en mayúsculas por `normalizarTicker`. El `check` es el espejo
  -- de esa función: si alguien inserta por otra vía, la base lo rechaza igual.
  ticker     text not null check (ticker ~ '^[A-Z][A-Z0-9.-]{0,11}$'),
  -- El nombre que devolvió Polygon al añadirlo, para no pedirlo en cada
  -- pintada. Si cambia, se corrige al volver a buscarlo: no es la verdad, es
  -- una etiqueta.
  nombre     text not null default '',
  created_at timestamptz not null default now(),
  -- Seguir dos veces lo mismo no es seguirlo más.
  unique (user_id, ticker)
);

create index if not exists idx_watchlist_user
  on public.watchlist (user_id, created_at desc);

alter table public.watchlist enable row level security;

drop policy if exists watchlist_own on public.watchlist;
create policy watchlist_own on public.watchlist
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, delete on public.watchlist to authenticated;
grant all privileges on public.watchlist to service_role;
revoke all on public.watchlist from anon;

comment on table public.watchlist is
  'Qué sigue la persona en el mercado (D-184). Guarda el ticker, NUNCA el precio: un precio en la base envejece en segundos y se enseñaría como propio sin poder responder por él.';
