-- 0002_rls_execution_collaboration.sql — pgTAP: RLS de Execution/Collaboration.
-- Se corre con `supabase test db` (local, sobre Docker) y en el job `db` de CI.
--
-- REESCRITO para el modelo "membresía = acceso" (migraciones 0030/0031).
--
-- QUÉ PROBABA ANTES Y POR QUÉ DEJÓ DE SER CIERTO
-- La aserción central era «un Member NO puede editar un proyecto compartido
-- solo con nivel view»: el acceso venía de `project_shares` y el rol apenas
-- matizaba. Desde 0031 eso se invirtió — el acceso lo da la MEMBRESÍA y un
-- Member edita los proyectos de su espacio. `project_shares` sobrevive con
-- otro trabajo: es la llave del GUEST, el colaborador externo que solo debe
-- alcanzar ciertos proyectos.
--
-- La tabla que este archivo verifica, rol por rol:
--
--   Owner/Admin   ve todo el espacio        edita
--   Member        ve todo el espacio        edita
--   Viewer        ve todo el espacio        NO edita
--   Guest         solo con project_shares   solo con share 'edit'
--   Outsider      no ve nada                no edita
--
-- Los dos últimos tests son estructurales y no cambian: Money OS y hábitos
-- nunca deben tener columna workspace_id (NG-007, BR-027).

begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email) values
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local'),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@test.local'),
  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@test.local'),
  ('99999999-9999-4999-8999-999999999991', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@test.local'),
  ('99999999-9999-4999-8999-999999999992', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guest@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('44444444-4444-4444-8444-444444444444', 'Owner'),
  ('55555555-5555-4555-8555-555555555555', 'Member'),
  ('66666666-6666-4666-8666-666666666666', 'Outsider'),
  ('99999999-9999-4999-8999-999999999991', 'Viewer'),
  ('99999999-9999-4999-8999-999999999992', 'Guest')
on conflict (user_id) do nothing;

-- Workspace del Owner + un miembro de cada rol que importa.
insert into public.workspaces (id, owner_id, name)
values ('77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444444', 'Equipo Test')
on conflict (id) do nothing;

insert into public.memberships (workspace_id, user_id, user_name, role, status) values
  ('77777777-7777-4777-8777-777777777777', '55555555-5555-4555-8555-555555555555', 'Member', 'Member', 'Active'),
  ('77777777-7777-4777-8777-777777777777', '99999999-9999-4999-8999-999999999991', 'Viewer', 'Viewer', 'Active'),
  ('77777777-7777-4777-8777-777777777777', '99999999-9999-4999-8999-999999999992', 'Guest', 'Guest', 'Active')
on conflict (workspace_id, user_id) do nothing;

-- DOS proyectos del Owner en ese espacio. Ninguno tiene project_shares: es
-- justamente lo que el modelo nuevo ya no necesita para que el equipo entre.
insert into public.projects (id, owner_id, workspace_id, title) values
  ('88888888-8888-4888-8888-888888888888', '44444444-4444-4444-8444-444444444444', '77777777-7777-4777-8777-777777777777', 'Proyecto del equipo'),
  ('88888888-8888-4888-8888-888888888889', '44444444-4444-4444-8444-444444444444', '77777777-7777-4777-8777-777777777777', 'Proyecto abierto a invitados')
on conflict (id) do nothing;

-- El SEGUNDO sí lo tiene: es el único que el Guest debe alcanzar.
insert into public.project_shares (project_id, workspace_id, access_level)
values ('88888888-8888-4888-8888-888888888889', '77777777-7777-4777-8777-777777777777', 'view')
on conflict (project_id) do nothing;

-- ---------------------------------------------------------------------------
-- Member: ve y EDITA sin necesidad de ningún share.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
set local role authenticated;

select isnt_empty(
  $$ select 1 from public.projects where id = '88888888-8888-4888-8888-888888888888' $$,
  'Member SÍ ve el proyecto del espacio sin ninguna fila en project_shares (0031: membresía = acceso)'
);

-- WITH data-modifying al nivel superior del statement (misma corrección que 0001).
with upd as (
  update public.projects set title = 'Editado por el Member'
  where id = '88888888-8888-4888-8888-888888888888'
  returning 1
)
select is(
  (select count(*)::int from upd),
  1,
  'Member SÍ edita un proyecto de su espacio (0031; antes el WITH CHECK de projects_update_edit se lo impedía aunque el USING lo dejara pasar)'
);

reset role;

-- ---------------------------------------------------------------------------
-- Viewer: ve todo el espacio y no edita nada.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-4999-8999-999999999991', 'role', 'authenticated')::text, true);
set local role authenticated;

select isnt_empty(
  $$ select 1 from public.projects where id = '88888888-8888-4888-8888-888888888888' $$,
  'Viewer SÍ ve los proyectos del espacio'
);

with upd as (
  update public.projects set title = 'Hackeado por el Viewer'
  where id = '88888888-8888-4888-8888-888888888888'
  returning 1
)
select is(
  (select count(*)::int from upd),
  0,
  'Viewer NO edita ningún proyecto, por más miembro que sea (BR-015)'
);

select is(
  public.can_edit_project('88888888-8888-4888-8888-888888888888'),
  false,
  'can_edit_project() dice que no para un Viewer (el helper que heredan tasks, comments y task_files)'
);

reset role;

-- ---------------------------------------------------------------------------
-- Guest: solo alcanza el proyecto que tiene share, y con 'view' no edita.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-4999-8999-999999999992', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select 1 from public.projects where id = '88888888-8888-4888-8888-888888888888' $$,
  'Guest NO ve un proyecto del espacio sin fila en project_shares (0031: el share es la llave del invitado)'
);

select isnt_empty(
  $$ select 1 from public.projects where id = '88888888-8888-4888-8888-888888888889' $$,
  'Guest SÍ ve el proyecto que se le abrió con project_shares'
);

with upd as (
  update public.projects set title = 'Hackeado por el Guest'
  where id = '88888888-8888-4888-8888-888888888889'
  returning 1
)
select is(
  (select count(*)::int from upd),
  0,
  'Guest con share de nivel view NO edita (solo access_level = edit lo habilita)'
);

reset role;

-- ---------------------------------------------------------------------------
-- Outsider: no es miembro de nada. Negativa total.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select 1 from public.projects where id in ('88888888-8888-4888-8888-888888888888', '88888888-8888-4888-8888-888888888889') $$,
  'Outsider NO ve los proyectos (no es miembro del workspace) — RLS negativa'
);

select is_empty(
  $$ select 1 from public.workspaces where id = '77777777-7777-4777-8777-777777777777' $$,
  'Outsider NO ve el workspace del que no es miembro'
);

reset role;

-- ---------------------------------------------------------------------------
-- Verificación estructural: Money OS y hábitos nunca exponen workspace_id.
-- ---------------------------------------------------------------------------
select hasnt_column('public', 'accounts', 'workspace_id', 'accounts NO debe tener columna workspace_id (NG-007)');
select hasnt_column('public', 'habits', 'workspace_id', 'habits NO debe tener columna workspace_id (BR-027)');

select * from finish();
rollback;
