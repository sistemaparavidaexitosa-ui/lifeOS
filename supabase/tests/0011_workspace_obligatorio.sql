-- 0011_workspace_obligatorio.sql — pgTAP: invariantes de la migración 0030.
-- Se corre con `supabase test db` (local, sobre Docker) y en el job `db` de CI.
--
-- POR QUÉ EXISTE
-- 0030 hace un `alter column workspace_id set not null` que en la práctica es
-- irreversible: si el backfill dejara un solo proyecto sin adoptar, la
-- migración aborta. Este archivo comprueba que las cuatro piezas de las que
-- depende ese paso siguen en pie, porque son invariantes que un cambio futuro
-- puede romper sin que nada más se queje:
--
--   1. projects.workspace_id es NOT NULL.
--   2. cada usuario tiene exactamente UN espacio personal (índice único
--      parcial), y el trigger de alta se lo crea.
--   3. el espacio personal no admite invitaciones.
--   4. un espacio con proyectos dentro no se puede eliminar.

begin;
select plan(7);

-- ---------------------------------------------------------------------------
-- 1) La columna
-- ---------------------------------------------------------------------------
select col_not_null(
  'public', 'projects', 'workspace_id',
  'projects.workspace_id es NOT NULL: no existe el proyecto sin espacio (0030)'
);

select hasnt_column(
  'public', 'workspaces', 'parent_id',
  'workspaces sigue siendo plano (la jerarquía la dan folders/projects, no un espacio dentro de otro)'
);

-- ---------------------------------------------------------------------------
-- 2) El espacio personal lo crea el trigger de alta
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('d1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nuevo@test.local')
on conflict (id) do nothing;

select is(
  (select count(*)::int from public.workspaces w
   where w.owner_id = 'd1111111-1111-4111-8111-111111111111' and w.is_personal),
  1,
  'Un usuario recién insertado ya tiene su espacio personal (handle_new_user, 0030)'
);

select is(
  (select count(*)::int from public.memberships m
   join public.workspaces w on w.id = m.workspace_id
   where w.owner_id = 'd1111111-1111-4111-8111-111111111111' and w.is_personal
     and m.user_id = 'd1111111-1111-4111-8111-111111111111' and m.role = 'Owner' and m.status = 'Active'),
  1,
  'Y su membresía Owner: sin ella no podría ni ver su propio espacio'
);

-- Un SEGUNDO espacio personal para el mismo dueño debe rebotar contra el
-- índice único parcial idx_workspaces_one_personal.
select throws_ok(
  $$ insert into public.workspaces (owner_id, name, is_personal)
     values ('d1111111-1111-4111-8111-111111111111', 'Otro personal', true) $$,
  '23505',
  null,
  'Un usuario NO puede tener dos espacios personales (índice único parcial)'
);

-- ---------------------------------------------------------------------------
-- 3) El espacio personal no admite invitaciones
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.invitations (workspace_id, email, role)
     select w.id, 'colado@test.local', 'Member'
     from public.workspaces w
     where w.owner_id = 'd1111111-1111-4111-8111-111111111111' and w.is_personal $$,
  'P0001',
  null,
  'Invitar a un espacio personal lo rechaza la BASE, no solo la interfaz (BR-012)'
);

-- ---------------------------------------------------------------------------
-- 4) Un espacio con proyectos no se elimina
-- ---------------------------------------------------------------------------
insert into public.workspaces (id, owner_id, name)
values ('d2222222-2222-4222-8222-222222222222', 'd1111111-1111-4111-8111-111111111111', 'Equipo con trabajo')
on conflict (id) do nothing;

insert into public.projects (id, owner_id, workspace_id, title)
values ('d3333333-3333-4333-8333-333333333333', 'd1111111-1111-4111-8111-111111111111', 'd2222222-2222-4222-8222-222222222222', 'Proyecto vivo')
on conflict (id) do nothing;

select throws_ok(
  $$ delete from public.workspaces where id = 'd2222222-2222-4222-8222-222222222222' $$,
  'P0001',
  null,
  'Un espacio con proyectos dentro no se puede eliminar (antes los dejaba huérfanos con workspace_id = null)'
);

select * from finish();
rollback;
