-- 0036_registro_de_habitos.sql — pgTAP: el registro dice qué pasó (0063).

begin;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email) values
  ('d1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reg-titular@test.local'),
  ('d2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reg-otro@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('d1111111-1111-4111-8111-111111111111', 'Titular Registro'),
  ('d2222222-2222-4222-8222-222222222222', 'Otro Registro')
on conflict (user_id) do nothing;

select has_column('public', 'habit_logs', 'status', 'habit_logs.status existe');
select has_column('public', 'habit_logs', 'completion_pct', 'habit_logs.completion_pct existe');
select has_column('public', 'habit_logs', 'note', 'habit_logs.note existe');
select has_column('public', 'habit_logs', 'mood', 'habit_logs.mood existe');
select has_column('public', 'habit_logs', 'energy', 'habit_logs.energy existe');
select has_table('public', 'daily_reflections', 'daily_reflections existe');

select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.routines (id, user_id, name, frequency)
values ('d3333333-3333-4333-8333-333333333333', 'd1111111-1111-4111-8111-111111111111', 'Mañana', 'Diario');
insert into public.habits (id, user_id, name, category, routine_id)
values ('d4444444-4444-4444-8444-444444444444', 'd1111111-1111-4111-8111-111111111111', 'Leer', 'Aprendizaje',
        'd3333333-3333-4333-8333-333333333333');

-- Una fila escrita como antes de 0063 significa lo mismo que siempre.
insert into public.habit_logs (habit_id, log_date)
values ('d4444444-4444-4444-8444-444444444444', '2026-09-10');
select results_eq(
  $$ select status, completion_pct from public.habit_logs where log_date = '2026-09-10' $$,
  $$ values ('completed'::text, 100::smallint) $$,
  'Sin estado, la fila queda completada al 100 %'
);

select throws_ok(
  $$ insert into public.habit_logs (habit_id, log_date, status, completion_pct)
     values ('d4444444-4444-4444-8444-444444444444', '2026-09-11', 'skipped', 50) $$,
  '23514', null,
  'Un omitido al 50 % no existe'
);
select throws_ok(
  $$ insert into public.habit_logs (habit_id, log_date, status, completion_pct)
     values ('d4444444-4444-4444-8444-444444444444', '2026-09-11', 'completed', 0) $$,
  '23514', null,
  'Un completado al 0 % no existe'
);
select throws_ok(
  $$ insert into public.habit_logs (habit_id, log_date, mood)
     values ('d4444444-4444-4444-8444-444444444444', '2026-09-11', 6) $$,
  '23514', null,
  'El ánimo va de 1 a 5'
);

insert into public.habit_logs (habit_id, log_date, status, completion_pct, note, energy)
values ('d4444444-4444-4444-8444-444444444444', '2026-09-11', 'postponed', 0, 'Viaje', 2);

select results_eq(
  $$ select dates, statuses from public.habit_log_series('2026-09-01', '2026-09-30') $$,
  $$ values (array['2026-09-10', '2026-09-11']::date[], array['completed', 'postponed']::text[]) $$,
  'habit_log_series devuelve el histórico en arreglos ordenados por fecha'
);

insert into public.daily_reflections (user_id, local_date, mood, energy, sleep_hours, reflection)
values ('d1111111-1111-4111-8111-111111111111', '2026-09-11', 4, 3, 6.5, 'Buen día');

select throws_ok(
  $$ insert into public.daily_reflections (user_id, local_date)
     values ('d1111111-1111-4111-8111-111111111111', '2026-09-11') $$,
  '23505', null,
  'Un check-in por día'
);
select throws_ok(
  $$ insert into public.daily_reflections (user_id, local_date)
     values ('d2222222-2222-4222-8222-222222222222', '2026-09-12') $$,
  '42501', null,
  'No se escribe un check-in a nombre de otra persona'
);

-- La otra persona no ve nada de lo anterior.
select set_config('request.jwt.claims', json_build_object('sub', 'd2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.daily_reflections $$,
  'Los check-ins ajenos no se ven'
);
select is_empty(
  $$ select 1 from public.habit_log_series('2026-09-01', '2026-09-30') $$,
  'habit_log_series no devuelve hábitos ajenos'
);
select ok(
  not has_function_privilege('authenticated', 'public.habit_log_series_de(uuid, date, date)', 'execute'),
  'authenticated no puede ejecutar habit_log_series_de'
);

reset role;
select results_eq(
  $$ select array_length(dates, 1) from public.habit_log_series_de('d1111111-1111-4111-8111-111111111111', '2026-09-01', '2026-09-30') $$,
  $$ values (2) $$,
  'habit_log_series_de lee el histórico de la persona indicada'
);

select * from finish();
rollback;
