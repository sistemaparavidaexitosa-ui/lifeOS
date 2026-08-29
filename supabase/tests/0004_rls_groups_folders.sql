-- 0004_rls_groups_folders.sql — pgTAP: RLS de task_groups y folders (FASE 2).
-- Se corre con `supabase test db` (local, sobre Docker) y en el job `db` de CI.
-- Verde en ambos desde el 2026-08-23 — ver /docs/CHECKS.md.
--
-- Mismo patrón que 0002_rls_execution_collaboration.sql: Owner, Member y
-- Outsider de un mismo workspace, para probar que task_groups/folders
-- heredan CORRECTAMENTE el acceso vía has_project_access/is_workspace_member
-- (sin duplicar ninguna función RLS nueva).
--
-- Actualizado con la migración 0031 ("membresía = acceso"): el test del Member
-- pasó de negativo a positivo. Ver la nota en su sección.

begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email) values
  ('b1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner2@test.local'),
  ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member2@test.local'),
  ('b3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider2@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('b1111111-1111-4111-8111-111111111111', 'Owner2'),
  ('b2222222-2222-4222-8222-222222222222', 'Member2'),
  ('b3333333-3333-4333-8333-333333333333', 'Outsider2')
on conflict (user_id) do nothing;

-- Workspace del Owner + membresía de Member
insert into public.workspaces (id, owner_id, name)
values ('b4444444-4444-4444-8444-444444444444', 'b1111111-1111-4111-8111-111111111111', 'Equipo Fase2')
on conflict (id) do nothing;

insert into public.memberships (workspace_id, user_id, user_name, role, status)
values ('b4444444-4444-4444-8444-444444444444', 'b2222222-2222-4222-8222-222222222222', 'Member2', 'Member', 'Active')
on conflict (workspace_id, user_id) do nothing;

-- Folder dentro del workspace
insert into public.folders (id, workspace_id, name)
values ('b5555555-5555-4555-8555-555555555555', 'b4444444-4444-4444-8444-444444444444', 'Marketing')
on conflict (id) do nothing;

-- Proyecto (Board) del Owner, dentro del workspace y del folder
insert into public.projects (id, owner_id, workspace_id, folder_id, title)
values ('b6666666-6666-4666-8666-666666666666', 'b1111111-1111-4111-8111-111111111111', 'b4444444-4444-4444-8444-444444444444', 'b5555555-5555-4555-8555-555555555555', 'Board Fase2')
on conflict (id) do nothing;

-- Grupo dentro del Board
insert into public.task_groups (id, project_id, name, position)
values ('b7777777-7777-4777-8777-777777777777', 'b6666666-6666-4666-8666-666666666666', 'Sprint 1', 0)
on conflict (id) do nothing;

-- Como Owner: POSITIVA — ve su folder y su grupo, y puede editarlos
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select isnt_empty(
  $$ select 1 from public.folders where id = 'b5555555-5555-4555-8555-555555555555' $$,
  'Owner SÍ ve su propio folder (RLS positiva)'
);

select isnt_empty(
  $$ select 1 from public.task_groups where id = 'b7777777-7777-4777-8777-777777777777' $$,
  'Owner SÍ ve el grupo de su propio Board (RLS positiva, hereda has_project_access)'
);

select lives_ok(
  $$ update public.task_groups set name = 'Sprint 1 (editado)' where id = 'b7777777-7777-4777-8777-777777777777' $$,
  'Owner SÍ puede editar el grupo (RLS positiva, hereda can_edit_project)'
);

reset role;

-- Como Member: POSITIVA — ve el grupo del Board por SER MIEMBRO del espacio.
--
-- Esta aserción estaba invertida hasta la migración 0031: antes un Member no
-- veía el Board sin una fila en project_shares, y este test comprobaba esa
-- ausencia. Con "membresía = acceso" el Board es del espacio y sus grupos se
-- heredan igual que las tareas — la llave por proyecto quedó reservada al rol
-- Guest. Se cambia la expectativa, no el montaje: es exactamente el mismo
-- Member de antes.
select set_config('request.jwt.claims', json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select isnt_empty(
  $$ select 1 from public.task_groups where id = 'b7777777-7777-4777-8777-777777777777' $$,
  'Member SÍ ve el grupo del Board de su espacio, sin project_shares (0031, hereda has_project_access)'
);

-- Pero SÍ ve el folder, porque folders solo depende de ser miembro del
-- workspace (is_workspace_member), no de tener acceso a un Board específico.
select isnt_empty(
  $$ select 1 from public.folders where id = 'b5555555-5555-4555-8555-555555555555' $$,
  'Member SÍ ve el folder del workspace (RLS positiva, folders depende de is_workspace_member)'
);

-- Member no puede crear folders (solo Owner/Admin)
select throws_ok(
  $$ insert into public.folders (workspace_id, name) values ('b4444444-4444-4444-8444-444444444444', 'Intento Member') $$,
  'new row violates row-level security policy for table "folders"',
  'Member (rol Member, no Admin) NO puede crear un folder (RLS negativa, folders_insert exige Owner/Admin)'
);

reset role;

-- Como Outsider (no es miembro del workspace): NEGATIVA total
select set_config('request.jwt.claims', json_build_object('sub', 'b3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select 1 from public.folders where id = 'b5555555-5555-4555-8555-555555555555' $$,
  'Outsider NO ve el folder (no es miembro del workspace)'
);

select is_empty(
  $$ select 1 from public.task_groups where id = 'b7777777-7777-4777-8777-777777777777' $$,
  'Outsider NO ve el grupo del Board (no tiene acceso al proyecto)'
);

reset role;

select * from finish();
rollback;
