-- supabase/tests/0048_centro_escritura.sql — pgTAP: migración 0078 (D-203).
begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'escritura-a@test.local'),
  ('f4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'escritura-b@test.local')
on conflict (id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', 'f3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.coach_proposals (user_id, message_id, origen, tipo, titulo, payload) values
  ('f3333333-3333-4333-8333-333333333333', null, 'centro', 'cambio', 'Avena',
   '{"operacion":"crear","tabla":"food_entries","id":null,"campos":{"name":"Avena"},"antes":null}');

select is((select tipo from public.coach_proposals where titulo = 'Avena'), 'cambio', 'El tipo cambio se admite (0078)');

-- La lista es acumulativa (ver 0071): los anteriores siguen vivos.
insert into public.coach_proposals (user_id, message_id, origen, tipo, titulo, payload) values
  ('f3333333-3333-4333-8333-333333333333', null, 'centro', 'nota', 'Idea', '{}'),
  ('f3333333-3333-4333-8333-333333333333', null, 'centro', 'foco', 'Sigue', '{"href":"/money"}');
select is((select count(*)::int from public.coach_proposals where tipo in ('nota', 'foco', 'cambio')), 3, 'nota, foco y cambio conviven');

select throws_ok(
  $$ insert into public.coach_proposals (user_id, message_id, origen, tipo, titulo)
     values ('f3333333-3333-4333-8333-333333333333', null, 'centro', 'inventado', 'x') $$,
  '23514', null, 'Un tipo inventado se sigue rechazando'
);

-- La RLS no cambia: otra persona no ve el cambio propuesto.
select set_config('request.jwt.claims', json_build_object('sub', 'f4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.coach_proposals where tipo = 'cambio'), 0, 'Un cambio propuesto es privado de quien lo recibió');

select * from finish();
rollback;
