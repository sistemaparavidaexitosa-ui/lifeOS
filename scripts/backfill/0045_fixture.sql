-- scripts/backfill/0045_fixture.sql
-- Datos con la forma ANTERIOR a la migración 0045, para comprobar que el
-- backfill coloca cada hábito donde la spec dice. Lo corre
-- scripts/verificar-backfill-0045.sh, no `supabase test db`: una prueba pgTAP
-- normal se ejecuta sobre el esquema YA migrado, donde estas columnas no
-- existen y estos datos son imposibles de crear.
--
-- Y por eso vive en scripts/ y no en supabase/tests/: `supabase test db` le
-- pasa a pg_prove el directorio entero, subcarpetas incluidas, así que un .sql
-- ahí dentro que no emita TAP tumba la suite.

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'backfill-a@test.local'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'backfill-b@test.local')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- USUARIO A
-- ---------------------------------------------------------------------------
insert into public.occupations (id, user_id, title, start_time, end_time, category, occ_date)
values ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Mañana', '06:00', '07:00', 'Personal', current_date);

insert into public.routines (id, user_id, name, frequency, position, created_at)
values ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Cierre de día', 'Diario', 0, now());

-- Caso 1: hábito que YA es paso de una rutina. Hereda esa rutina, y con ella
-- la posición y la duración del paso.
insert into public.habits (id, user_id, name, frequency, category)
values ('a2000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Anotar el día', 'Diario', 'Personal');
insert into public.routine_steps (id, routine_id, position, title, duration_min, habit_id)
values ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        2, 'Anotar el día', 15, 'a2000000-0000-4000-8000-000000000001');

-- Caso 4: paso de texto libre, sin hábito detrás. Se convierte en hábito.
insert into public.routine_steps (id, routine_id, position, title, duration_min, habit_id)
values ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
        3, 'Dejar la ropa lista', 4, null);

-- Caso 2: dos hábitos sueltos atados al mismo bloque. Forman una rutina que se
-- llama como el bloque. Dos son 'Diario' y uno 'Semanal' → gana 'Diario'.
insert into public.habits (id, user_id, name, frequency, category, occupation_id, created_at) values
  ('a2000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'Meditar', 'Diario', 'Salud', 'a0000000-0000-4000-8000-000000000001', now() - interval '2 days'),
  ('a2000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'Estirar', 'Diario', 'Salud', 'a0000000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('a2000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001', 'Pesarme', 'Semanal', 'Salud', 'a0000000-0000-4000-8000-000000000001', now());

-- Caso 3: hábito suelto sin bloque. Va a una rutina por frecuencia.
insert into public.habits (id, user_id, name, frequency, category)
values ('a2000000-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Llamar a mamá', 'Semanal', 'Personal');

-- ---------------------------------------------------------------------------
-- USUARIO B — el hábito que está en DOS rutinas
-- ---------------------------------------------------------------------------
insert into public.routines (id, user_id, name, frequency, position, created_at) values
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'Primera', 'Diario', 0, now()),
  ('b1000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Segunda', 'Diario', 1, now());

insert into public.habits (id, user_id, name, frequency, category)
values ('b2000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002',
        'Beber agua', 'Diario', 'Salud');

insert into public.routine_steps (id, routine_id, position, title, duration_min, habit_id) values
  ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 0, 'Beber agua', 1, 'b2000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 0, 'Beber agua', 2, 'b2000000-0000-4000-8000-000000000001');
