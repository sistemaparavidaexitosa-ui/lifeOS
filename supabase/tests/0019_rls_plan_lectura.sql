-- 0019_rls_plan_lectura.sql — pgTAP: migración 0043 (cola semanal de lectura).
--
-- Dos cosas que la aplicación no puede garantizar por sí sola:
--
--   1. `reading_plan_weeks` es privado por el libro padre. Un plan de lectura
--      dice qué te interesa y cuándo pensabas leerlo; es tan personal como el
--      historial de 0034. Nace hoy, así que su RLS se prueba hoy.
--
--   2. `week_start` es SIEMPRE lunes. La app lo normaliza con weekStartISO(),
--      pero si la única defensa fuera esa, una fila escrita desde SQL, desde un
--      seed o desde una versión futura de la acción rompería la agrupación por
--      semana en silencio. La restricción es lo que lo impide pase lo que pase.

begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email) values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'planlector@test.local'),
  ('a2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'planotro@test.local')
on conflict (id) do nothing;

insert into public.books (id, user_id, title, status, current_page, total_pages, category) values
  ('a3333333-3333-4333-8333-333333333333', 'a1111111-1111-4111-8111-111111111111',
   'Deep Work', 'Leyendo', 60, 300, 'Desarrollo personal'),
  ('a4444444-4444-4444-8444-444444444444', 'a2222222-2222-4222-8222-222222222222',
   'Libro de otro', 'Leyendo', 10, 200, 'Otros')
on conflict (id) do nothing;

-- 2026-08-31 es lunes.
insert into public.reading_plan_weeks (book_id, week_start, position)
values ('a3333333-3333-4333-8333-333333333333', '2026-08-31', 0)
on conflict (book_id, week_start) do nothing;

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------
select has_table('public', 'reading_plan_weeks', 'reading_plan_weeks existe (0043)');
select has_column('public', 'reading_plan_weeks', 'week_start', 'reading_plan_weeks.week_start existe');

-- El lunes es una restricción, no una convención de la capa de aplicación.
select throws_ok(
  $$ insert into public.reading_plan_weeks (book_id, week_start)
     values ('a3333333-3333-4333-8333-333333333333', '2026-09-01') $$,
  '23514',
  null,
  'Una semana que NO empieza en lunes se rechaza (reading_plan_weeks_lunes_check)'
);

-- ---------------------------------------------------------------------------
-- El dueño ve y escribe su propio plan
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select isnt_empty(
  $$ select 1 from public.reading_plan_weeks where book_id = 'a3333333-3333-4333-8333-333333333333' $$,
  'El dueño SÍ ve el plan de lectura de su libro'
);

select lives_ok(
  $$ insert into public.reading_plan_weeks (book_id, week_start, position)
     values ('a3333333-3333-4333-8333-333333333333', '2026-09-07', 0) $$,
  'El dueño SÍ puede programar otra semana'
);

-- Las claves foráneas no evalúan RLS, pero el `with check` de la política sí:
-- programar el libro de otra cuenta tiene que fallar al escribir.
select throws_ok(
  $$ insert into public.reading_plan_weeks (book_id, week_start)
     values ('a4444444-4444-4444-8444-444444444444', '2026-09-07') $$,
  '42501',
  null,
  'NO se puede programar un libro de OTRA cuenta (with check de la política)'
);

reset role;

-- ---------------------------------------------------------------------------
-- Otro usuario no ve nada
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select 1 from public.reading_plan_weeks where book_id = 'a3333333-3333-4333-8333-333333333333' $$,
  'Otro usuario NO ve tu plan de lectura: dice qué te interesa y cuándo pensabas leerlo'
);

reset role;

select * from finish();
rollback;
