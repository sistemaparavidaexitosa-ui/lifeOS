-- 0044_centro_lienzo.sql — pgTAP: migración 0071 (D-168).
--
-- Dos añadidos pequeños: el tipo `nota`, que es donde acaban las ideas que se
-- escriben en la barra del centro, y la columna donde se guarda el «cómo voy»
-- para no volver a pedírselo al modelo en la misma franja.

begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lienzo-a@test.local')
on conflict (id) do nothing;

select has_column('public', 'centro_runs', 'resumen', 'centro_runs.resumen existe (0071)');

select set_config('request.jwt.claims', json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.coach_proposals (user_id, message_id, origen, tipo, titulo, payload) values
  ('f1111111-1111-4111-8111-111111111111', null, 'centro', 'nota', 'Idea sobre la tienda',
   '{"notebookId":"f2222222-2222-4222-8222-222222222222","cuerpo":"Probar envíos gratis"}');

select is(
  (select tipo from public.coach_proposals limit 1),
  'nota',
  'El tipo nota se admite (0071)'
);

select is(
  (select payload->>'cuerpo' from public.coach_proposals limit 1),
  'Probar envíos gratis',
  'El cuerpo de la nota viaja en el payload'
);

-- Los tipos anteriores siguen vivos: la lista es acumulativa y reescribirla mal
-- ya rompió una vez el pgTAP de otra feature (ver 0070).
insert into public.coach_proposals (user_id, message_id, origen, tipo, titulo, payload) values
  ('f1111111-1111-4111-8111-111111111111', null, 'centro', 'foco', 'Sigue con Dinero', '{"href":"/money"}');

select is(
  (select count(*)::int from public.coach_proposals where tipo in ('nota', 'foco')),
  2,
  'nota y foco conviven: la lista de tipos no se ha pisado'
);

select throws_ok(
  $$ insert into public.coach_proposals (user_id, message_id, origen, tipo, titulo)
     values ('f1111111-1111-4111-8111-111111111111', null, 'centro', 'inventado', 'x') $$,
  '23514', null,
  'Un tipo inventado se sigue rechazando'
);

select * from finish();
rollback;
