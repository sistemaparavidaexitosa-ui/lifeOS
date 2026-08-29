-- 0012_rls_notebooks.sql — pgTAP: RLS de notebooks/notes (migración 0032).
-- Se corre con `supabase test db` (local, sobre Docker) y en el job `db` de CI.
--
-- QUÉ SE VERIFICA, y por qué cada cosa
--
--   Rol       | Ve el cuaderno y sus notas | Escribe
--   ----------|---------------------------|--------
--   Owner     | sí                        | sí
--   Member    | sí                        | sí
--   Viewer    | sí                        | NUNCA
--   Guest     | NO                        | no
--   Outsider  | NO                        | no
--
-- El Guest es el caso que más importa de los cinco. Su llave de acceso es
-- `project_shares`, que es POR PROYECTO; los cuadernos no tienen equivalente,
-- así que dejarlo entrar le abriría de golpe todo lo que el espacio escribe —
-- justo lo contrario de lo que ese rol significa.
--
-- Y el último test es el que de verdad quita el sueño: que search_notes() no
-- devuelva notas de un espacio del que no eres miembro. Una fuga por búsqueda
-- no la nota nadie hasta que es tarde, porque no aparece en ninguna pantalla.

begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email) values
  ('e1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nbowner@test.local'),
  ('e2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nbmember@test.local'),
  ('e3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nbviewer@test.local'),
  ('e4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nbguest@test.local'),
  ('e5555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nboutsider@test.local')
on conflict (id) do nothing;

insert into public.workspaces (id, owner_id, name)
values ('e6666666-6666-4666-8666-666666666666', 'e1111111-1111-4111-8111-111111111111', 'Equipo Cuadernos')
on conflict (id) do nothing;

insert into public.memberships (workspace_id, user_id, user_name, role, status) values
  ('e6666666-6666-4666-8666-666666666666', 'e2222222-2222-4222-8222-222222222222', 'NBMember', 'Member', 'Active'),
  ('e6666666-6666-4666-8666-666666666666', 'e3333333-3333-4333-8333-333333333333', 'NBViewer', 'Viewer', 'Active'),
  ('e6666666-6666-4666-8666-666666666666', 'e4444444-4444-4444-8444-444444444444', 'NBGuest', 'Guest', 'Active')
on conflict (workspace_id, user_id) do nothing;

insert into public.notebooks (id, workspace_id, title, created_by, created_by_name)
values ('e7777777-7777-4777-8777-777777777777', 'e6666666-6666-4666-8666-666666666666', 'Actas de dirección',
        'e1111111-1111-4111-8111-111111111111', 'NBOwner')
on conflict (id) do nothing;

insert into public.notes (id, notebook_id, title, body, created_by, created_by_name, updated_by, updated_by_name)
values ('e8888888-8888-4888-8888-888888888888', 'e7777777-7777-4777-8777-777777777777',
        'Acuerdos de marzo', 'Se aprobó la mudanza de la dirección general.',
        'e1111111-1111-4111-8111-111111111111', 'NBOwner',
        'e1111111-1111-4111-8111-111111111111', 'NBOwner')
on conflict (id) do nothing;

-- Nota aparte SOLO para el test de búsqueda, y no es un capricho: el test del
-- Member (más abajo) reescribe el cuerpo de la nota anterior, y como todo el
-- archivo corre en una sola transacción, ese cambio sigue vivo cuando se llega
-- a buscar. Con una nota que nadie toca, la búsqueda prueba la búsqueda y no
-- el orden de los tests.
insert into public.notes (id, notebook_id, title, body, created_by, created_by_name, updated_by, updated_by_name)
values ('e9999999-9999-4999-8999-999999999999', 'e7777777-7777-4777-8777-777777777777',
        'Presupuesto anual', 'La dirección aprobó el gasto de la mudanza.',
        'e1111111-1111-4111-8111-111111111111', 'NBOwner',
        'e1111111-1111-4111-8111-111111111111', 'NBOwner')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Member: lee y escribe
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'e2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select isnt_empty(
  $$ select 1 from public.notes where id = 'e8888888-8888-4888-8888-888888888888' $$,
  'Member SÍ ve las notas del espacio (membresía = acceso, igual que en los proyectos)'
);

with upd as (
  update public.notes set body = 'Editado por el Member'
  where id = 'e8888888-8888-4888-8888-888888888888'
  returning 1
)
select is(
  (select count(*)::int from upd),
  1,
  'Member SÍ edita una nota que escribió otro: la nota es una página colaborativa'
);

reset role;

-- ---------------------------------------------------------------------------
-- Viewer: lee y no escribe
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'e3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
set local role authenticated;

select isnt_empty(
  $$ select 1 from public.notebooks where id = 'e7777777-7777-4777-8777-777777777777' $$,
  'Viewer SÍ ve los cuadernos del espacio'
);

with upd as (
  update public.notes set body = 'Hackeado por el Viewer'
  where id = 'e8888888-8888-4888-8888-888888888888'
  returning 1
)
select is(
  (select count(*)::int from upd),
  0,
  'Viewer NO edita ninguna nota (BR-015, mismo criterio que con los proyectos)'
);

reset role;

-- ---------------------------------------------------------------------------
-- Guest: fuera. Su acceso es por proyecto y aquí no hay equivalente.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select 1 from public.notebooks where id = 'e7777777-7777-4777-8777-777777777777' $$,
  'Guest NO ve los cuadernos del espacio, aunque sea miembro activo'
);

select is_empty(
  $$ select 1 from public.notes where id = 'e8888888-8888-4888-8888-888888888888' $$,
  'Guest NO ve las notas: si las viera, un invitado externo leería todo lo que el equipo escribe'
);

reset role;

-- ---------------------------------------------------------------------------
-- Outsider: negativa total, incluida la búsqueda
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'e5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select 1 from public.notes where id = 'e8888888-8888-4888-8888-888888888888' $$,
  'Outsider NO ve las notas de un espacio del que no es miembro'
);

select is(
  (select count(*)::int from public.search_notes('e6666666-6666-4666-8666-666666666666', 'presupuesto')),
  0,
  'La BÚSQUEDA tampoco filtra: search_notes() no es SECURITY DEFINER, así que la RLS se aplica dentro'
);

reset role;

-- ---------------------------------------------------------------------------
-- La búsqueda en español funciona para quien SÍ tiene acceso
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Se busca "direccion" SIN tilde contra un cuerpo que la escribió CON tilde:
-- es lo que aporta la configuración 'spanish' frente a un LIKE.
select is(
  (select count(*)::int from public.search_notes('e6666666-6666-4666-8666-666666666666', 'direccion')),
  1,
  'El Owner encuentra su nota buscando sin tilde lo que se escribió con tilde (configuración spanish)'
);

reset role;

select * from finish();
rollback;
