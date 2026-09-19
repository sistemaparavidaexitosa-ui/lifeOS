-- 0042_navegacion_premium.sql — pgTAP: migración 0069 (D-166).
--
-- El modo de navegación es de cada persona. Se fija aquí:
--   · sin fila, el modo es premium (es «el nuevo sistema de navegación»);
--   · el vocabulario lo impone la base;
--   · nadie ve el modo de otra persona, y `ritual_gate()` contesta sobre quien
--     la llama.

begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('d1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nav-a@test.local'),
  ('d2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nav-b@test.local')
on conflict (id) do nothing;

select has_column('public', 'ritual_prefs', 'nav_mode', 'ritual_prefs.nav_mode existe (0069)');

select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select pref_nav_mode from public.ritual_gate('2026-09-19')),
  'premium',
  'Sin fila de preferencias, el modo es premium'
);

insert into public.ritual_prefs (user_id, nav_mode) values ('d1111111-1111-4111-8111-111111111111', 'habitual');

select is(
  (select pref_nav_mode from public.ritual_gate('2026-09-19')),
  'habitual',
  'ritual_gate() devuelve el modo guardado'
);

select throws_ok(
  $$ update public.ritual_prefs set nav_mode = 'otro' $$,
  '23514', null,
  'Un modo fuera del vocabulario se rechaza en la base'
);

select set_config('request.jwt.claims', json_build_object('sub', 'd2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from public.ritual_prefs),
  0,
  'Nadie ve el modo de navegación de otra persona'
);

select is(
  (select pref_nav_mode from public.ritual_gate('2026-09-19')),
  'premium',
  'ritual_gate() contesta sobre quien la llama: el otro sigue en premium'
);

select * from finish();
rollback;
