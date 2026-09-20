-- 0043_centro_agentico.sql — pgTAP: migración 0070 (D-167).
--
-- Dos cosas nuevas y una que NO cambia:
--   · el tipo `foco`, que no escribe nada y solo lleva a una pantalla;
--   · `centro_runs`, la guarda que impide más de una generación por franja;
--   · y la lista de tipos sigue siendo cerrada: lo que el modelo se invente no
--     entra en la cola.
--
-- Y un origen más, `centro`: la regla de 0062 no es «hay que tener turno de
-- chat» sino «el coach tiene que tenerlo», así que el centro entra sin turno,
-- igual que 'analisis' y 'grafo'.

begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email) values
  ('e1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'centro-a@test.local'),
  ('e2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'centro-b@test.local')
on conflict (id) do nothing;

select has_table('public', 'centro_runs', 'centro_runs existe (0070)');

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.ai_chat_messages (id, user_id, role, content) values
  ('e3333333-3333-4333-8333-333333333333', 'e1111111-1111-4111-8111-111111111111', 'assistant', 'x');

insert into public.coach_proposals (user_id, message_id, tipo, titulo, payload) values
  ('e1111111-1111-4111-8111-111111111111', 'e3333333-3333-4333-8333-333333333333', 'foco', 'Sigue con Rediseño', '{"href":"/execution","motivo":"12 movimientos"}');

select is(
  (select tipo from public.coach_proposals limit 1),
  'foco',
  'El tipo foco se admite (0070)'
);

insert into public.coach_proposals (user_id, message_id, origen, tipo, titulo, payload) values
  ('e1111111-1111-4111-8111-111111111111', null, 'centro', 'foco', 'Abre Dinero', '{"href":"/money","motivo":"4 días de quincena"}');

select is(
  (select count(*)::int from public.coach_proposals where origen = 'centro' and message_id is null),
  1,
  'Una sugerencia del centro vive sin turno de chat (origen = centro)'
);

select throws_ok(
  $$ insert into public.coach_proposals (user_id, message_id, tipo, titulo)
     values ('e1111111-1111-4111-8111-111111111111', 'e3333333-3333-4333-8333-333333333333', 'inventado', 'x') $$,
  '23514', null,
  'Un tipo inventado se sigue rechazando'
);

insert into public.centro_runs (user_id, local_date, franja, facts_hash)
  values ('e1111111-1111-4111-8111-111111111111', '2026-09-19', 'tarde', 'abc');

select throws_ok(
  $$ insert into public.centro_runs (user_id, local_date, franja, facts_hash)
     values ('e1111111-1111-4111-8111-111111111111', '2026-09-19', 'tarde', 'otro') $$,
  '23505', null,
  'Una sola generación por persona, día y franja: la PK es la guarda del gasto'
);

select throws_ok(
  $$ insert into public.centro_runs (user_id, local_date, franja)
     values ('e1111111-1111-4111-8111-111111111111', '2026-09-19', 'madrugada') $$,
  '23514', null,
  'Una franja inventada se rechaza'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from public.centro_runs),
  0,
  'Nadie ve las generaciones de otra persona'
);

select is(
  (select count(*)::int from public.coach_proposals),
  0,
  'Ni sus propuestas'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

-- La regla de 0062 sigue intacta: el coach NO puede entrar sin su turno.
select throws_ok(
  $$ insert into public.coach_proposals (user_id, message_id, origen, tipo, titulo)
     values ('e1111111-1111-4111-8111-111111111111', null, 'coach', 'tarea', 'x') $$,
  '23514', null,
  'El coach sigue necesitando su turno de chat (0062 intacta)'
);

select * from finish();
rollback;
