-- 0021_habitos_en_rutinas.sql — pgTAP: el hábito vive dentro de su rutina
-- (migración 0045).
--
-- El backfill NO se prueba aquí: se ejecuta sobre el esquema anterior, que ya
-- no existe cuando esta prueba corre. Lo cubre
-- scripts/verificar-backfill-0045.sh.

begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email) values
  ('c1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rut-titular@test.local'),
  ('c2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rut-otro@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('c1111111-1111-4111-8111-111111111111', 'Titular Rutinas'),
  ('c2222222-2222-4222-8222-222222222222', 'Otro Rutinas')
on conflict (user_id) do nothing;

-- El esquema dice lo que la spec prometió
select has_column('public', 'habits', 'routine_id', 'habits.routine_id existe (0045)');
select has_column('public', 'routines', 'identity', 'routines.identity existe (0045)');
select hasnt_column('public', 'habits', 'frequency', 'habits.frequency ya no existe: la dicta la rutina');
select hasnt_table('public', 'routine_steps', 'routine_steps ya no existe: el paso ES el hábito');

select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.routines (id, user_id, name, frequency, identity)
values ('c3333333-3333-4333-8333-333333333333', 'c1111111-1111-4111-8111-111111111111',
        'Mañana Milagrosa', 'Diario', 'Soy alguien que no negocia sus mañanas');

insert into public.habits (id, user_id, name, category, routine_id, position, duration_min)
values ('c4444444-4444-4444-8444-444444444444', 'c1111111-1111-4111-8111-111111111111',
        'Meditar', 'Salud', 'c3333333-3333-4333-8333-333333333333', 0, 10);

-- Un hábito sin rutina es imposible, y lo impide la BASE, no la aplicación
select throws_ok(
  $$ insert into public.habits (user_id, name, category)
     values ('c1111111-1111-4111-8111-111111111111', 'Huérfano', 'Otros') $$,
  '23502',
  null,
  'Un hábito sin routine_id no se puede insertar (not null)'
);

-- Marcar el mismo hábito dos veces el mismo día deja UNA fila, no dos.
-- Antes de 0045 esto lo defendían dos caminos —el paso de rutina y el hábito—
-- y una función de dominio los reconciliaba. Ahora solo hay un camino, así que
-- el índice único de habit_logs es toda la garantía que queda: se prueba donde
-- vive.
insert into public.habit_logs (habit_id, log_date)
values ('c4444444-4444-4444-8444-444444444444', current_date);
select throws_ok(
  $$ insert into public.habit_logs (habit_id, log_date)
     values ('c4444444-4444-4444-8444-444444444444', current_date) $$,
  '23505',
  null,
  'Marcar dos veces el mismo día no bifurca la racha: habit_logs es único por (habit_id, log_date)'
);

-- Borrar la rutina se lleva sus hábitos: sin rutina no pueden existir
delete from public.routines where id = 'c3333333-3333-4333-8333-333333333333';
select is_empty(
  $$ select 1 from public.habits where id = 'c4444444-4444-4444-8444-444444444444' $$,
  'Borrar la rutina borra sus hábitos (on delete cascade)'
);

-- El guard: no puedes colgar tu hábito de la rutina de otro
insert into public.routines (id, user_id, name, frequency)
values ('c5555555-5555-4555-8555-555555555555', 'c1111111-1111-4111-8111-111111111111', 'Propia', 'Diario');

set local role postgres;
insert into public.routines (id, user_id, name, frequency)
values ('c6666666-6666-4666-8666-666666666666', 'c2222222-2222-4222-8222-222222222222', 'Ajena', 'Diario');
set local role authenticated;

select throws_ok(
  $$ insert into public.habits (user_id, name, category, routine_id)
     values ('c1111111-1111-4111-8111-111111111111', 'Colado', 'Otros', 'c6666666-6666-4666-8666-666666666666') $$,
  'P0001',
  'Solo puedes poner un hábito en una rutina tuya.',
  'No puedes colgar un hábito de la rutina de otra cuenta (guard_habit_routine_owner)'
);

-- Y el otro usuario sigue sin ver nada (BR-027)
select set_config('request.jwt.claims', json_build_object('sub', 'c2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select is_empty(
  $$ select 1 from public.habits where user_id = 'c1111111-1111-4111-8111-111111111111' $$,
  'Otro usuario no ve los hábitos del titular (BR-027)'
);

select * from finish();
rollback;
