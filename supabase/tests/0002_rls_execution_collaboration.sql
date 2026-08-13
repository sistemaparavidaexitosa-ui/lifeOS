-- 0002_rls_execution_collaboration.sql — pgTAP: RLS de Execution/Collaboration.
-- ⚠️ NO EJECUTADO en el entorno del asistente. Correr con: `supabase test db`.
--
-- Rev. fix 2 (post segunda corrida real en CI):
--   1) "infinite recursion detected in policy for relation projects": bug de
--      diseño real en las políticas RLS (ciclo projects <-> project_shares
--      vía has_project_access/can_edit_project). Corregido en la migración
--      supabase/migrations/0011_fix_rls_recursion.sql (row_security=off en
--      las funciones helper). Este archivo de test no cambia su lógica de
--      negocio, solo se beneficia del fix de la migración.
--   2) Mismo bug de "WITH clause ... must be at the top level" que en
--      0001 — corregido con el mismo patrón (WITH al nivel superior).

begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email) values
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local'),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@test.local'),
  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('44444444-4444-4444-8444-444444444444', 'Owner'),
  ('55555555-5555-4555-8555-555555555555', 'Member'),
  ('66666666-6666-4666-8666-666666666666', 'Outsider')
on conflict (user_id) do nothing;

-- Workspace del Owner + membresía de Member
insert into public.workspaces (id, owner_id, name)
values ('77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444444', 'Equipo Test')
on conflict (id) do nothing;

insert into public.memberships (workspace_id, user_id, user_name, role, status)
values ('77777777-7777-4777-8777-777777777777', '55555555-5555-4555-8555-555555555555', 'Member', 'Member', 'Active')
on conflict (workspace_id, user_id) do nothing;

-- Proyecto personal del Owner, movido al workspace y compartido con nivel 'view'
insert into public.projects (id, owner_id, workspace_id, title)
values ('88888888-8888-4888-8888-888888888888', '44444444-4444-4444-8444-444444444444', '77777777-7777-4777-8777-777777777777', 'Proyecto Compartido')
on conflict (id) do nothing;

insert into public.project_shares (project_id, workspace_id, access_level)
values ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', 'view')
on conflict (project_id) do nothing;

-- Como Member: POSITIVA — puede leer el proyecto compartido (nivel view)
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
set local role authenticated;

select isnt_empty(
  $$ select 1 from public.projects where id = '88888888-8888-4888-8888-888888888888' $$,
  'Member SÍ ve el proyecto compartido con nivel view (RLS positiva, FR-COL-001) — requiere fix 0011 (recursión)'
);

-- CORREGIDO (fix 2): WITH data-modifying al nivel superior del statement.
with upd as (
  update public.projects set title = 'Hackeado'
  where id = '88888888-8888-4888-8888-888888888888'
  returning 1
)
select is(
  (select count(*)::int from upd),
  0,
  'Member NO puede editar un proyecto compartido solo con nivel view (RLS negativa, BR-015/can_edit_project)'
);

reset role;

-- Como Outsider (no es miembro del workspace): NEGATIVA total
select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select 1 from public.projects where id = '88888888-8888-4888-8888-888888888888' $$,
  'Outsider NO ve el proyecto (no es miembro del workspace) — RLS negativa'
);

select is_empty(
  $$ select 1 from public.workspaces where id = '77777777-7777-4777-8777-777777777777' $$,
  'Outsider NO ve el workspace del que no es miembro'
);

reset role;

-- Como Owner: POSITIVA — control total sobre su propio proyecto
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ update public.projects set title = 'Proyecto Compartido (editado)' where id = '88888888-8888-4888-8888-888888888888' $$,
  'Owner SÍ puede editar su propio proyecto (RLS positiva)'
);

reset role;

-- Verificación estructural: Money OS nunca expone workspace_id (NG-007)
select hasnt_column('public', 'accounts', 'workspace_id', 'accounts NO debe tener columna workspace_id (NG-007)');
select hasnt_column('public', 'habits', 'workspace_id', 'habits NO debe tener columna workspace_id (BR-027)');

select * from finish();
rollback;
