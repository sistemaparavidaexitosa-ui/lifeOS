-- 0018_rls_hilo_proyecto.sql — pgTAP: el hilo de un PROYECTO (migración 0041).
--
-- POR QUÉ EXISTE
-- `comments` acepta subject_type = 'project' desde 0003, pero nadie había
-- escrito nunca uno: todo el hilo vivía colgado de una tarea. Al abrir la
-- pestaña «Hilo» del proyecto salió lo que la 0041 arregla — las políticas de
-- `comment_reactions` (0038) resolvían el sujeto con un join literal a
-- public.tasks, así que sobre un comentario de proyecto no casaban ninguna
-- fila. Y una política que no casa no da error: el insert se rechaza en
-- silencio y el hilo se queda mudo sin decir por qué.
--
-- Por eso la reacción se inserta AQUÍ suplantando al miembro, no sembrada como
-- superusuario: sembrada saltaría la política, que es justo lo que se prueba.

begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hilo-owner@test.local'),
  ('f2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hilo-member@test.local'),
  ('f3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hilo-fuera@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('f1111111-1111-4111-8111-111111111111', 'Hilo Owner'),
  ('f2222222-2222-4222-8222-222222222222', 'Hilo Member'),
  ('f3333333-3333-4333-8333-333333333333', 'Hilo Fuera')
on conflict (user_id) do nothing;

-- Un espacio COMPARTIDO: is_personal en false, que es la condición con la que
-- la pestaña «Hilo» aparece en el menú superior del proyecto.
insert into public.workspaces (id, owner_id, name, is_personal)
values ('f9999999-9999-4999-8999-999999999999', 'f1111111-1111-4111-8111-111111111111', 'Equipo Hilo', false)
on conflict (id) do nothing;

insert into public.memberships (workspace_id, user_id, user_name, role, status)
values ('f9999999-9999-4999-8999-999999999999', 'f2222222-2222-4222-8222-222222222222', 'Hilo Member', 'Member', 'Active')
on conflict (workspace_id, user_id) do nothing;

insert into public.projects (id, owner_id, workspace_id, title, status)
values ('f4444444-4444-4444-8444-444444444444', 'f1111111-1111-4111-8111-111111111111', 'f9999999-9999-4999-8999-999999999999', 'Proyecto con hilo', 'Active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- El miembro escribe en el hilo del PROYECTO y menciona al dueño.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'f2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.comments (id, subject_type, subject_id, author_id, author_name, body, mentions, mentioned_user_ids)
values (
  'f6666666-6666-4666-8666-666666666666', 'project', 'f4444444-4444-4444-8444-444444444444',
  'f2222222-2222-4222-8222-222222222222', 'Hilo Member',
  '@Hilo Owner, dejé cargado el último commit, favor de aplicar las migraciones',
  array['Hilo Owner'], array['f1111111-1111-4111-8111-111111111111']::uuid[]
);

select is(
  (select count(*)::int from public.comments where subject_type = 'project' and subject_id = 'f4444444-4444-4444-8444-444444444444'),
  1,
  'Un miembro del espacio escribe y lee el hilo del proyecto (comments acepta subject_type project desde 0003)'
);

-- La reacción es lo que la 0041 desbloquea: antes esta línea era rechazada por
-- comment_reactions_insert, cuyo join a tasks no casaba nada.
insert into public.comment_reactions (comment_id, user_id, emoji)
values ('f6666666-6666-4666-8666-666666666666', 'f2222222-2222-4222-8222-222222222222', '👍');

select is(
  (select count(*)::int from public.comment_reactions where comment_id = 'f6666666-6666-4666-8666-666666666666'),
  1,
  'Se puede reaccionar a un comentario de proyecto (migración 0041)'
);

-- ---------------------------------------------------------------------------
-- El dueño ve la conversación y la reacción del otro.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from public.comment_reactions where comment_id = 'f6666666-6666-4666-8666-666666666666'),
  1,
  'La reacción de un compañero se ve: el contador del hilo suma para todos'
);

-- ---------------------------------------------------------------------------
-- Quien no es del espacio no ve nada, y tampoco puede escribir.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'f3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.comments where subject_id = 'f4444444-4444-4444-8444-444444444444' $$,
  'El hilo del proyecto no se filtra a quien no es miembro del espacio'
);

select is_empty(
  $$ select 1 from public.comment_reactions where comment_id = 'f6666666-6666-4666-8666-666666666666' $$,
  'Ni las reacciones: can_view_comment_subject aplica el mismo acceso que al comentario'
);

select throws_ok(
  $$ insert into public.comments (subject_type, subject_id, author_id, author_name, body)
     values ('project', 'f4444444-4444-4444-8444-444444444444', 'f3333333-3333-4333-8333-333333333333', 'Hilo Fuera', 'me cuelo') $$,
  'new row violates row-level security policy for table "comments"',
  'Un extraño no puede escribir en el hilo de un proyecto ajeno'
);

select * from finish();
rollback;
