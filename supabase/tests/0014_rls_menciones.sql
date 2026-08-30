-- 0014_rls_menciones.sql — pgTAP: identidad de las menciones (migración 0037).
-- Lo que se prueba es la parte que ninguna prueba de dominio puede cubrir: que
-- `comment_reads` sea privada de cada lector, y que marcar leído NO abra la
-- puerta a reescribir el comentario de otro.

begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'men-duena@test.local'),
  ('a2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'men-otra@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('a1111111-1111-4111-8111-111111111111', 'Dueña'),
  ('a2222222-2222-4222-8222-222222222222', 'Otra')
on conflict (user_id) do nothing;

-- La dueña crea espacio, proyecto, tarea y un comentario que menciona a Otra.
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.workspaces (id, owner_id, name)
values ('b1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'Espacio menciones');

insert into public.projects (id, owner_id, workspace_id, title)
values ('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'Proyecto');

insert into public.tasks (id, project_id, title)
values ('d1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'Tarea');

insert into public.comments (id, subject_type, subject_id, author_id, author_name, body, mentions, mentioned_user_ids)
values (
  'e1111111-1111-4111-8111-111111111111', 'task', 'd1111111-1111-4111-8111-111111111111',
  'a1111111-1111-4111-8111-111111111111', 'Dueña', 'Ojo @Otra',
  array['Otra'], array['a2222222-2222-4222-8222-222222222222']::uuid[]
);

select is(
  (select mentioned_user_ids[1] from public.comments where id = 'e1111111-1111-4111-8111-111111111111'),
  'a2222222-2222-4222-8222-222222222222'::uuid,
  'La mención guarda el id, no solo el nombre (migración 0037)'
);

-- La dueña marca leído lo suyo.
insert into public.comment_reads (comment_id, user_id)
values ('e1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111');

-- Marcar dos veces no revienta: la clave primaria compuesta lo hace idempotente
-- desde el servidor, sin lógica en el cliente.
select throws_ok(
  $$ insert into public.comment_reads (comment_id, user_id)
     values ('e1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111') $$,
  '23505',
  null,
  'comment_reads es único por (comment_id, user_id): el upsert del cliente se apoya en esto'
);

-- No se puede marcar leído EN NOMBRE de otro.
select throws_ok(
  $$ insert into public.comment_reads (comment_id, user_id)
     values ('e1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222') $$,
  'new row violates row-level security policy for table "comment_reads"',
  'Nadie puede marcar como leído en nombre de otra persona'
);

-- Ahora la otra usuaria.
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.comment_reads $$,
  'Lo leído es de quien lee: la marca de la dueña no la ve la otra usuaria'
);

-- Sin acceso al proyecto tampoco ve el comentario: la bandeja no puede filtrar
-- una mención de un espacio al que no perteneces.
select is_empty(
  $$ select 1 from public.comments where id = 'e1111111-1111-4111-8111-111111111111' $$,
  'La RLS de comments sigue mandando: mencionada pero sin acceso al proyecto, no lo ve'
);

select is(
  (select count(*)::int from public.workspace_activity),
  0,
  'workspace_activity sigue vacía para quien no es miembro del espacio'
);

select * from finish();
rollback;
