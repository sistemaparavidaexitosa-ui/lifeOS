-- 0005_rls_task_files.sql — pgTAP: RLS de task_files (FASE 3, Drawer/Archivos).
-- Se corre con `supabase test db` (local, sobre Docker) y en el job `db` de CI.
-- Verde en ambos desde el 2026-08-23 — ver /docs/CHECKS.md.
--
-- ⚠️ Cobertura parcial declarada con honestidad: esta suite solo prueba la
-- tabla de METADATOS (public.task_files) vía pgTAP. Las políticas de
-- storage.objects (task_files_storage_select/insert/delete, migración 0020)
-- requieren subir bytes reales a un bucket de Storage, lo cual pgTAP no
-- ejercita — deben verificarse manualmente subiendo un archivo desde la UI
-- con dos usuarios distintos tras el deploy (ver /docs/DEPLOY.md §4).

begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('c1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner3@test.local'),
  ('c2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider3@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('c1111111-1111-4111-8111-111111111111', 'Owner3'),
  ('c2222222-2222-4222-8222-222222222222', 'Outsider3')
on conflict (user_id) do nothing;

insert into public.projects (id, owner_id, title)
values ('c3333333-3333-4333-8333-333333333333', 'c1111111-1111-4111-8111-111111111111', 'Board Fase3')
on conflict (id) do nothing;

insert into public.tasks (id, project_id, title)
values ('c4444444-4444-4444-8444-444444444444', 'c3333333-3333-4333-8333-333333333333', 'Tarea con archivo')
on conflict (id) do nothing;

-- Como Owner: POSITIVA — puede registrar y ver el metadato de su propio archivo
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ insert into public.task_files (id, task_id, file_name, storage_path, size_bytes, content_type, uploaded_by)
     values ('c5555555-5555-4555-8555-555555555555', 'c4444444-4444-4444-8444-444444444444', 'plan.pdf', 'c4444444-4444-4444-8444-444444444444/1-plan.pdf', 1024, 'application/pdf', 'c1111111-1111-4111-8111-111111111111') $$,
  'Owner SÍ puede registrar el metadato de un archivo en su propia tarea (RLS positiva, hereda can_edit_project)'
);

select isnt_empty(
  $$ select 1 from public.task_files where id = 'c5555555-5555-4555-8555-555555555555' $$,
  'Owner SÍ ve el archivo que acaba de registrar (RLS positiva, hereda has_project_access)'
);

-- Negativa: no puede registrar un archivo a nombre de otro usuario (uploaded_by != auth.uid())
select throws_ok(
  $$ insert into public.task_files (task_id, file_name, storage_path, size_bytes, content_type, uploaded_by)
     values ('c4444444-4444-4444-8444-444444444444', 'otro.pdf', 'c4444444-4444-4444-8444-444444444444/2-otro.pdf', 512, 'application/pdf', 'c2222222-2222-4222-8222-222222222222') $$,
  'new row violates row-level security policy for table "task_files"',
  'Owner NO puede registrar un archivo con uploaded_by de otro usuario (RLS negativa, defensa contra suplantación)'
);

select lives_ok(
  $$ delete from public.task_files where id = 'c5555555-5555-4555-8555-555555555555' $$,
  'Owner SÍ puede eliminar el metadato del archivo (RLS positiva, hereda can_edit_project)'
);

reset role;

-- Re-crea el archivo para la prueba negativa de Outsider
insert into public.task_files (id, task_id, file_name, storage_path, size_bytes, content_type, uploaded_by)
values ('c6666666-6666-4666-8666-666666666666', 'c4444444-4444-4444-8444-444444444444', 'confidencial.pdf', 'c4444444-4444-4444-8444-444444444444/3-confidencial.pdf', 2048, 'application/pdf', 'c1111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

-- Como Outsider (sin acceso al proyecto): NEGATIVA total
select set_config('request.jwt.claims', json_build_object('sub', 'c2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select 1 from public.task_files where id = 'c6666666-6666-4666-8666-666666666666' $$,
  'Outsider NO ve el metadato del archivo (RLS negativa, no tiene acceso al proyecto)'
);

-- Mismo patrón que 0001_rls_money.sql/0002_rls_execution_collaboration.sql:
-- un DELETE bloqueado por RLS no lanza excepción, simplemente afecta 0 filas
-- (la política RLS filtra la fila antes de que el DELETE la alcance).
with del as (
  delete from public.task_files where id = 'c6666666-6666-4666-8666-666666666666'
  returning 1
)
select is(
  (select count(*)::int from del),
  0,
  'Outsider NO puede eliminar el archivo: RLS filtra la fila (0 filas afectadas, no excepción)'
);

reset role;

select * from finish();
rollback;
