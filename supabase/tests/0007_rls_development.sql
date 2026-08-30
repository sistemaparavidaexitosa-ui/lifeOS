-- 0007_rls_development.sql — pgTAP: Personal Development OS (migración 0024).
-- Se corre con `supabase test db` (local, sobre Docker) y en el job `db` de CI
-- (.github/workflows/ci.yml). Verde en ambos desde el 2026-08-23.
-- BR-012/019/027: todo el módulo es privado por user_id. Ningún rol de
-- workspace lo alcanza, y un usuario no ve las filas de otro.

begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-titular@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-otro@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('11111111-1111-4111-8111-111111111111', 'Titular Dev'),
  ('22222222-2222-4222-8222-222222222222', 'Otro Dev')
on conflict (user_id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.personal_goals (id, user_id, title, area, horizon)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Leer 24 libros', 'Aprendizaje', '2026-12-31');

insert into public.key_results (id, goal_id, title, source_kind, target)
values ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 'Libros terminados', 'manual', 24);

insert into public.occupations (id, user_id, title, start_time, end_time, category, occ_date)
values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Mañana', '06:00', '07:00', 'Personal', current_date);

insert into public.habits (id, user_id, name)
values ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'Meditar');

insert into public.routines (id, user_id, name, occupation_id)
values ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 'Rutina matutina', '55555555-5555-4555-8555-555555555555');

insert into public.routine_steps (id, routine_id, position, title, duration_min, habit_id)
values ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', 0, 'Meditar 10 min', 10, '66666666-6666-4666-8666-666666666666');

-- BR-026: borrar la ocupación NO borra la rutina, solo la desliga
delete from public.occupations where id = '55555555-5555-4555-8555-555555555555';
select is(
  (select occupation_id from public.routines where id = '77777777-7777-4777-8777-777777777777'),
  null,
  'occupation_id de la rutina queda en null al borrar la ocupación (BR-026)'
);

-- Borrar el hábito NO borra el paso de rutina
delete from public.habits where id = '66666666-6666-4666-8666-666666666666';
select is(
  (select habit_id from public.routine_steps where id = '88888888-8888-4888-8888-888888888888'),
  null,
  'habit_id del paso queda en null al borrar el hábito, el paso sobrevive'
);

-- Un solo run por rutina y día
insert into public.routine_runs (routine_id, local_date) values ('77777777-7777-4777-8777-777777777777', current_date);
select throws_ok(
  $$ insert into public.routine_runs (routine_id, local_date) values ('77777777-7777-4777-8777-777777777777', current_date) $$,
  '23505',
  null,
  'routine_runs es único por (routine_id, local_date)'
);

-- Migración 0035: un ahorro puede sostener un resultado clave.
-- Se prueba aquí y no solo en el dominio porque el `check` es la garantía de la
-- BASE: si alguien amplía el enum de TypeScript y olvida la migración, el
-- dominio compila y el insert revienta en producción.
select lives_ok(
  $$ insert into public.key_results (goal_id, title, source_kind, source_id, target)
     values ('33333333-3333-4333-8333-333333333333', 'Fondo de emergencia', 'savings_goal', gen_random_uuid(), 50000) $$,
  'key_results acepta source_kind = savings_goal (migración 0035)'
);

-- Y el check sigue cerrado: la lista es de seis valores, no "cualquier texto".
select throws_ok(
  $$ insert into public.key_results (goal_id, title, source_kind, source_id, target)
     values ('33333333-3333-4333-8333-333333333333', 'Inventado', 'criptomoneda', gen_random_uuid(), 1) $$,
  '23514',
  null,
  'key_results sigue rechazando un source_kind que no está en la lista'
);

-- El otro usuario no ve nada
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select is_empty(
  $$ select 1 from public.personal_goals $$,
  'Otro usuario no ve las metas personales del titular (BR-012)'
);
select is_empty(
  $$ select 1 from public.key_results $$,
  'Otro usuario no ve los resultados clave del titular, protegidos vía el padre'
);

-- §9 del spec: "ningún rol de workspace alcanza ninguna tabla del módulo".
-- Como estas tablas no tienen workspace_id y su política es user_id =
-- auth.uid(), un miembro de workspace no es más que otro usuario: basta con
-- que las tres tablas de rutinas también queden vacías para él.
select is_empty(
  $$ select 1 from public.routines $$,
  'Otro usuario no ve las rutinas del titular (BR-027)'
);
select is_empty(
  $$ select 1 from public.routine_steps $$,
  'Otro usuario no ve los pasos de rutina del titular, protegidos vía el padre'
);
select is_empty(
  $$ select 1 from public.routine_runs $$,
  'Otro usuario no ve las ejecuciones de rutina del titular, protegidas vía el padre'
);

select * from finish();
rollback;
