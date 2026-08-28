-- 0010_rls_comments_delete.sql — pgTAP: política DELETE de public.comments
-- (migración 0029). Se corre con `supabase test db`.
--
-- POR QUÉ EXISTE
-- comments nació sin política de DELETE. Con RLS activo eso NO da error: el
-- borrado devuelve éxito y elimina cero filas. El agujero se ve al borrar un
-- proyecto — tasks y task_groups caen en cascada, pero comments no tiene clave
-- foránea (su relación es polimórfica: subject_type + subject_id) y sus filas
-- quedaban colgando de tareas que ya no existen.
--
-- MONTAJE
-- El mismo de 0002: workspace del Owner, Member dentro del workspace y el
-- proyecto compartido con nivel 'view'. Ese nivel es el que importa aquí — el
-- Member TIENE acceso de lectura (puede leer y escribir comentarios) pero NO
-- puede editar el proyecto, así que borrar su propio comentario solo puede
-- pasar por la rama `author_id = auth.uid()` de la política, aislada.
--
-- Un detalle que este archivo fija por escrito: Postgres aplica las políticas
-- de SELECT al escanear las filas de un DELETE. Por eso "el autor borra lo
-- suyo" está acotado por "sobre un proyecto al que todavía tiene acceso", que
-- es justo lo que comments_insert exigía para poder escribirlo.

begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email) values
  ('c1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cowner@test.local'),
  ('c2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cmember@test.local'),
  ('c3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coutsider@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('c1111111-1111-4111-8111-111111111111', 'COwner'),
  ('c2222222-2222-4222-8222-222222222222', 'CMember'),
  ('c3333333-3333-4333-8333-333333333333', 'COutsider')
on conflict (user_id) do nothing;

insert into public.workspaces (id, owner_id, name)
values ('c9999999-9999-4999-8999-999999999999', 'c1111111-1111-4111-8111-111111111111', 'Equipo Comentarios')
on conflict (id) do nothing;

insert into public.memberships (workspace_id, user_id, user_name, role, status)
values ('c9999999-9999-4999-8999-999999999999', 'c2222222-2222-4222-8222-222222222222', 'CMember', 'Member', 'Active')
on conflict (workspace_id, user_id) do nothing;

insert into public.projects (id, owner_id, workspace_id, title, status)
values ('c4444444-4444-4444-8444-444444444444', 'c1111111-1111-4111-8111-111111111111', 'c9999999-9999-4999-8999-999999999999', 'Proyecto con comentarios', 'Active')
on conflict (id) do nothing;

insert into public.project_shares (project_id, workspace_id, access_level)
values ('c4444444-4444-4444-8444-444444444444', 'c9999999-9999-4999-8999-999999999999', 'view')
on conflict (project_id) do nothing;

insert into public.tasks (id, project_id, title, status)
values ('c5555555-5555-4555-8555-555555555555', 'c4444444-4444-4444-8444-444444444444', 'Tarea comentada', 'Pending')
on conflict (id) do nothing;

-- Un comentario del Owner y otro del Member sobre la misma tarea.
insert into public.comments (id, subject_type, subject_id, author_id, author_name, body) values
  ('c6666666-6666-4666-8666-666666666666', 'task', 'c5555555-5555-4555-8555-555555555555', 'c1111111-1111-4111-8111-111111111111', 'COwner', 'del dueño'),
  ('c7777777-7777-4777-8777-777777777777', 'task', 'c5555555-5555-4555-8555-555555555555', 'c2222222-2222-4222-8222-222222222222', 'CMember', 'del member')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Outsider: ni autor ni con acceso al proyecto → no borra nada.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'c3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
set local role authenticated;

delete from public.comments where id = 'c6666666-6666-4666-8666-666666666666';

reset role;

select isnt_empty(
  $$ select 1 from public.comments where id = 'c6666666-6666-4666-8666-666666666666' $$,
  'Outsider NO borra el comentario ajeno: la fila sigue ahí (RLS negativa)'
);

-- ---------------------------------------------------------------------------
-- Member (acceso 'view', NO puede editar el proyecto): borra SOLO lo suyo.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'c2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  public.can_edit_comment_subject('task', 'c5555555-5555-4555-8555-555555555555'),
  false,
  'El Member con acceso view NO puede editar el proyecto: la rama de dueño no le aplica'
);

delete from public.comments where id = 'c6666666-6666-4666-8666-666666666666';
delete from public.comments where id = 'c7777777-7777-4777-8777-777777777777';

reset role;

select isnt_empty(
  $$ select 1 from public.comments where id = 'c6666666-6666-4666-8666-666666666666' $$,
  'El Member NO borra el comentario del dueño (no es su autor y no puede editar el proyecto)'
);

select is_empty(
  $$ select 1 from public.comments where id = 'c7777777-7777-4777-8777-777777777777' $$,
  'El Member SÍ borra su PROPIO comentario (RLS positiva por author_id)'
);

-- ---------------------------------------------------------------------------
-- Owner: se lleva los comentarios de la tarea sean de quien sean, y al borrar
-- el proyecto las tareas caen en cascada. Es lo que hace deleteProject().
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

delete from public.comments where subject_type = 'task' and subject_id = 'c5555555-5555-4555-8555-555555555555';
delete from public.projects where id = 'c4444444-4444-4444-8444-444444444444';

reset role;

select is_empty(
  $$ select 1 from public.comments where subject_id = 'c5555555-5555-4555-8555-555555555555'
     union all
     select 1 from public.tasks where project_id = 'c4444444-4444-4444-8444-444444444444' $$,
  'El dueño borra los comentarios de la tarea y, con el proyecto, sus tareas caen en cascada'
);

select * from finish();
rollback;
