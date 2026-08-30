-- 0016_busqueda_transversal.sql — pgTAP: search_workspace (migración 0039).
--
-- Lo que se prueba aquí es lo único que ninguna prueba de dominio puede: que la
-- búsqueda NO sea `security definer` de facto — es decir, que un usuario sin
-- acceso al espacio no obtenga resultados aunque llame al RPC con su uuid.

begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('b1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bus-duena@test.local'),
  ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bus-otra@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('b1111111-1111-4111-8111-111111111111', 'Dueña Bus'),
  ('b2222222-2222-4222-8222-222222222222', 'Otra Bus')
on conflict (user_id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.workspaces (id, owner_id, name)
values ('c1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'Espacio Búsqueda');
insert into public.projects (id, owner_id, workspace_id, title, objective)
values ('c2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111',
        'c1111111-1111-4111-8111-111111111111', 'Migración del almacén', 'Mover el inventario');
insert into public.tasks (id, project_id, title, description)
values ('c3333333-3333-4333-8333-333333333333', 'c2222222-2222-4222-8222-222222222222',
        'Inventariar cajas', 'Contar las cajas del almacén');
insert into public.comments (id, subject_type, subject_id, author_id, author_name, body)
values ('c4444444-4444-4444-8444-444444444444', 'task', 'c3333333-3333-4333-8333-333333333333',
        'b1111111-1111-4111-8111-111111111111', 'Dueña Bus', 'Las cajas del almacén ya están contadas');

-- El índice es en ESPAÑOL y LEMATIZA: el singular encuentra el plural.
--
-- Lo que NO se afirma aquí, y conviene dejar dicho: el stemmer español NO
-- garantiza insensibilidad a los acentos, aunque el comentario de 0032 lo diga.
-- A veces coincide («dirección» y «direccion» se reducen ambos a 'direccion') y
-- a veces no («almacén» da 'almacen' pero «almacen» da 'almac'). Depende de la
-- palabra, así que no es una promesa que se pueda probar. Conseguirlo de verdad
-- pide la extensión `unaccent` y una configuración de texto propia, y eso
-- obligaría a regenerar `notes.search`: es una decisión aparte.
select isnt_empty(
  $$ select 1 from public.search_workspace('c1111111-1111-4111-8111-111111111111', 'caja') $$,
  'Busca en español y lematiza: el singular «caja» encuentra «cajas»'
);

select is(
  (select count(*)::int from public.search_workspace('c1111111-1111-4111-8111-111111111111', 'cajas')),
  2,
  'Cruza fuentes: «cajas» aparece en la tarea y en el comentario'
);

select is(
  (select count(*)::int from public.search_workspace('c1111111-1111-4111-8111-111111111111', 'cajas', 'task')),
  1,
  'El filtro tipo: acota a una sola fuente'
);

select is(
  (select count(*)::int from public.search_workspace('c1111111-1111-4111-8111-111111111111', 'cajas', null, 'Dueña')),
  1,
  'El filtro de: deja fuera lo que no tiene autor (tareas y proyectos)'
);

select is_empty(
  $$ select 1 from public.search_workspace('c1111111-1111-4111-8111-111111111111', 'cajas', null, null, current_date - 1) $$,
  'El filtro antes: es exclusivo y descarta lo de hoy'
);

-- La prueba que importa: otra usuaria, con el uuid del espacio en la mano.
select set_config('request.jwt.claims', json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.search_workspace('c1111111-1111-4111-8111-111111111111', 'almacen') $$,
  'Sin acceso al espacio no hay resultados, aunque se llame al RPC con su uuid (NO es security definer)'
);

select * from finish();
rollback;
