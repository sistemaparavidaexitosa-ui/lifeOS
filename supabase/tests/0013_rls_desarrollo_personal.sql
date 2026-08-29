-- 0013_rls_desarrollo_personal.sql — pgTAP: migraciones 0033 y 0034.
--
-- Dos cosas que la aplicación no puede garantizar por sí sola:
--
--   1. `book_progress` es privado por el libro padre. Es historial de lectura:
--      dice cuánto lees y cuándo dejaste de hacerlo. Nace hoy, así que su RLS
--      se prueba hoy y no cuando ya tenga meses de datos dentro.
--
--   2. Un hábito no se puede apilar sobre el de otra cuenta. Las claves
--      foráneas NO evalúan RLS: sin el trigger de 0033, `stack_after_habit_id`
--      aceptaría el id de un hábito ajeno. No filtraría su contenido —seguirías
--      sin poder leer esa fila— pero dejaría una referencia entre cuentas que
--      nadie sabría explicar después.

begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lector@test.local'),
  ('f2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@test.local')
on conflict (id) do nothing;

insert into public.books (id, user_id, title, status, current_page, total_pages, category)
values ('f3333333-3333-4333-8333-333333333333', 'f1111111-1111-4111-8111-111111111111',
        'Hábitos atómicos', 'Leyendo', 120, 320, 'Desarrollo personal')
on conflict (id) do nothing;

insert into public.book_progress (book_id, local_date, page)
values ('f3333333-3333-4333-8333-333333333333', '2026-08-20', 100)
on conflict (book_id, local_date) do nothing;

insert into public.habits (id, user_id, name) values
  ('f4444444-4444-4444-8444-444444444444', 'f1111111-1111-4111-8111-111111111111', 'Leer'),
  ('f5555555-5555-4555-8555-555555555555', 'f2222222-2222-4222-8222-222222222222', 'Correr (de otro)')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------
select has_column('public', 'books', 'category', 'books.category existe (0034)');
select has_column('public', 'habits', 'two_min_version', 'habits.two_min_version existe (0033)');

-- ---------------------------------------------------------------------------
-- El dueño ve y escribe su propio historial
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select isnt_empty(
  $$ select 1 from public.book_progress where book_id = 'f3333333-3333-4333-8333-333333333333' $$,
  'El dueño SÍ ve el historial de lectura de su libro'
);

select lives_ok(
  $$ insert into public.book_progress (book_id, local_date, page)
     values ('f3333333-3333-4333-8333-333333333333', '2026-08-29', 120) $$,
  'El dueño SÍ puede registrar un punto de progreso'
);

-- Un hábito no puede apilarse sobre sí mismo: es una imposibilidad, no una
-- preferencia, así que vive como restricción y no como validación de la app.
select throws_ok(
  $$ update public.habits set stack_after_habit_id = id
     where id = 'f4444444-4444-4444-8444-444444444444' $$,
  '23514',
  null,
  'Un hábito NO puede apilarse sobre sí mismo (habits_no_self_stack)'
);

reset role;

-- ---------------------------------------------------------------------------
-- Otro usuario no ve nada
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'f2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select 1 from public.book_progress where book_id = 'f3333333-3333-4333-8333-333333333333' $$,
  'Otro usuario NO ve tu historial de lectura: dice cuánto lees y cuándo dejaste de hacerlo'
);

reset role;

-- ---------------------------------------------------------------------------
-- El hábito ancla tiene que ser tuyo (trigger de 0033)
-- ---------------------------------------------------------------------------
-- Se prueba como superusuario a propósito: si la única defensa fuera la RLS,
-- este UPDATE pasaría. El trigger es lo que lo impide pase lo que pase.
select throws_ok(
  $$ update public.habits
     set stack_after_habit_id = 'f5555555-5555-4555-8555-555555555555'
     where id = 'f4444444-4444-4444-8444-444444444444' $$,
  'P0001',
  null,
  'No se puede apilar un hábito sobre el de OTRA cuenta (las claves foráneas no evalúan RLS)'
);

select * from finish();
rollback;
