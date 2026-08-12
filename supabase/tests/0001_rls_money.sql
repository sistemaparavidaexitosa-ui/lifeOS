-- 0001_rls_money.sql — pgTAP: RLS de Money OS (accounts, journal_entries).
-- ⚠️ NO EJECUTADO en el entorno del asistente (sin supabase CLI/psql
-- disponibles aquí — ver /docs/CHECKS.md). Correr con: `supabase test db`.
--
-- Patrón: simulamos dos usuarios distintos vía `set_config('request.jwt.claims', ...)`
-- (el mecanismo real que usa PostgREST/Supabase para poblar auth.uid()).

begin;
select plan(6);

-- Dos usuarios de prueba
insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user1@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user2@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('11111111-1111-4111-8111-111111111111', 'User One'),
  ('22222222-2222-4222-8222-222222222222', 'User Two')
on conflict (user_id) do nothing;

insert into public.accounts (id, user_id, name, type, currency, opening_balance)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Cuenta de User1', 'bank', 'MXN', 1000)
on conflict (id) do nothing;

-- Actuar como user1
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

-- POSITIVA: user1 SÍ ve su propia cuenta (F9: la prueba positiva es la que suele faltar)
select isnt_empty(
  $$ select 1 from public.accounts where id = '33333333-3333-4333-8333-333333333333' $$,
  'user1 puede leer su propia cuenta (RLS positiva)'
);

select lives_ok(
  $$ insert into public.journal_entries (user_id, type, memo, entry_date, effective_at, category, dedupe_key)
     values ('11111111-1111-4111-8111-111111111111', 'expense', 'Test', current_date, current_date, 'Otros', 'test-1') $$,
  'user1 puede insertar su propio asiento contable (RLS positiva)'
);

reset role;

-- Actuar como user2 (NEGATIVA)
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select 1 from public.accounts where id = '33333333-3333-4333-8333-333333333333' $$,
  'user2 NO puede ver la cuenta de user1 (RLS negativa — aislamiento Money OS, NG-007)'
);

select throws_ok(
  $$ update public.accounts set name = 'hackeado' where id = '33333333-3333-4333-8333-333333333333' $$,
  null, null,
  'user2 no puede actualizar la cuenta de user1 (0 filas afectadas o excepción de policy)'
);

-- anon (sin sesión) no debe leer nada de Money OS
reset role;
set local role anon;
select is_empty(
  $$ select 1 from public.accounts $$,
  'anon no ve ninguna cuenta (auth.uid() es null bajo anon)'
);

reset role;
select is_empty(
  $$ select 1 from public.journal_entries where user_id = '22222222-2222-4222-8222-222222222222' $$,
  'user2 no tiene asientos propios en este test (control de aislamiento por defecto)'
);

select * from finish();
rollback;
