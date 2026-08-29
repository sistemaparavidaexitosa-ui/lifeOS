-- 0015_rls_reacciones_recordatorios.sql — pgTAP: reacciones y recordatorios
-- (migración 0038). Lo que se prueba es lo que ninguna prueba de dominio puede:
-- que nadie reaccione ni recuerde en nombre de otro, y que las reacciones
-- hereden exactamente el acceso del comentario.

begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rx-duena@test.local'),
  ('f2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rx-otra@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('f1111111-1111-4111-8111-111111111111', 'Dueña Rx'),
  ('f2222222-2222-4222-8222-222222222222', 'Otra Rx')
on conflict (user_id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.workspaces (id, owner_id, name)
values ('11111111-aaaa-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'Espacio Rx');
insert into public.projects (id, owner_id, workspace_id, title)
values ('22222222-aaaa-4222-8222-222222222222', 'f1111111-1111-4111-8111-111111111111', '11111111-aaaa-4111-8111-111111111111', 'Proyecto Rx');
insert into public.tasks (id, project_id, title)
values ('33333333-aaaa-4333-8333-333333333333', '22222222-aaaa-4222-8222-222222222222', 'Tarea Rx');
insert into public.comments (id, subject_type, subject_id, author_id, author_name, body)
values ('44444444-aaaa-4444-8444-444444444444', 'task', '33333333-aaaa-4333-8333-333333333333',
        'f1111111-1111-4111-8111-111111111111', 'Dueña Rx', 'Un comentario');

insert into public.comment_reactions (comment_id, user_id, emoji)
values ('44444444-aaaa-4444-8444-444444444444', 'f1111111-1111-4111-8111-111111111111', '✅');

-- La clave primaria compuesta es la regla de negocio: una persona, un emoji,
-- una vez. Sin ella, dos clics rápidos contarían 2 con una sola persona detrás.
select throws_ok(
  $$ insert into public.comment_reactions (comment_id, user_id, emoji)
     values ('44444444-aaaa-4444-8444-444444444444', 'f1111111-1111-4111-8111-111111111111', '✅') $$,
  '23505',
  null,
  'comment_reactions es único por (comment_id, user_id, emoji)'
);

-- El mismo usuario SÍ puede poner otro emoji distinto.
select lives_ok(
  $$ insert into public.comment_reactions (comment_id, user_id, emoji)
     values ('44444444-aaaa-4444-8444-444444444444', 'f1111111-1111-4111-8111-111111111111', '👍') $$,
  'Una misma persona puede poner varios emojis distintos'
);

select throws_ok(
  $$ insert into public.comment_reactions (comment_id, user_id, emoji)
     values ('44444444-aaaa-4444-8444-444444444444', 'f2222222-2222-4222-8222-222222222222', '👀') $$,
  'new row violates row-level security policy for table "comment_reactions"',
  'Nadie puede reaccionar en nombre de otra persona'
);

-- El `check` acota el emoji: no es un campo de texto libre.
select throws_ok(
  $$ insert into public.comment_reactions (comment_id, user_id, emoji)
     values ('44444444-aaaa-4444-8444-444444444444', 'f1111111-1111-4111-8111-111111111111',
             'esto es un parrafo entero y no un emoji') $$,
  '23514',
  null,
  'El emoji está acotado por `check`: no cabe un párrafo donde va un símbolo'
);

insert into public.reminders (user_id, subject_type, subject_id, remind_on)
values ('f1111111-1111-4111-8111-111111111111', 'task', '33333333-aaaa-4333-8333-333333333333', current_date);

select throws_ok(
  $$ insert into public.reminders (user_id, subject_type, subject_id, remind_on)
     values ('f2222222-2222-4222-8222-222222222222', 'task', '33333333-aaaa-4333-8333-333333333333', current_date) $$,
  'new row violates row-level security policy for table "reminders"',
  'Nadie puede crear un recordatorio en nombre de otra persona'
);

-- Ahora la otra usuaria, sin acceso a este proyecto.
select set_config('request.jwt.claims', json_build_object('sub', 'f2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.comment_reactions $$,
  'Las reacciones heredan el acceso del comentario: sin acceso al proyecto, no se ven'
);

select is_empty(
  $$ select 1 from public.reminders $$,
  'Los recordatorios son privados: nadie ve los de otro ni en un espacio compartido'
);

select * from finish();
rollback;
