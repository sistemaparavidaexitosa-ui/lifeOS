-- 0020_rls_template_catalog.sql — pgTAP: migración 0044 (catálogo de plantillas).
--
-- `template_catalog` es la PRIMERA tabla del esquema sin `user_id`. Todas las
-- demás se protegen con `user_id = auth.uid()` y su prueba se parece a la de al
-- lado; ésta no se parece a ninguna, y por eso no puede apoyarse en el patrón:
--
--   1. Un borrador NO lo ve nadie más que un administrador. Es lo único que
--      compensa haber sacado el catálogo de git (D-044 derogada): sin esta
--      garantía, editar en producción significa que alguien puede aplicar una
--      plantilla a medio escribir.
--   2. Escribir el catálogo es SOLO de administradores. Un usuario normal con
--      la llave anónima y un `insert` a mano no puede colar una plantilla a
--      todo el mundo.
--   3. `is_admin` es un privilegio de CONTENIDO, no de datos: que alguien lo
--      tenga no le abre ni una fila ajena (BR-012). Se prueba contra `profiles`,
--      que es la tabla privada por excelencia.
--   4. A `anon` no le llega nada, ni siquiera lo publicado: 0002 dejó puesto un
--      `alter default privileges ... to anon` que esta migración revoca a mano.

begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email) values
  ('b1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local'),
  ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'normal@test.local')
on conflict (id) do nothing;

-- El trigger de 0002 ya creó las dos filas de `profiles`. Solo una es admin.
update public.profiles set is_admin = true where user_id = 'b1111111-1111-4111-8111-111111111111';

insert into public.template_catalog (kind, slug, status, position, payload) values
  ('project', 'borrador-de-prueba', 'draft', 99, '{"id":"borrador-de-prueba","name":"Sin terminar","category":"Personal","summary":"A medio escribir","groups":[{"name":"G","color":"var(--c-purple)","tasks":[{"title":"T"}]}]}'::jsonb)
on conflict (kind, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Estructura y semilla
-- ---------------------------------------------------------------------------
select has_table('public', 'template_catalog', 'template_catalog existe (0044)');
select has_column('public', 'profiles', 'is_admin', 'profiles.is_admin existe (0044)');
select has_function('public', 'is_admin', 'is_admin() existe (0044)');

-- Que la mudanza del catálogo no perdiera nada por el camino.
select is(
  (select count(*)::int from public.template_catalog where status = 'published'),
  24,
  'El seed dejó las 24 plantillas publicadas (11 proyecto, 3 rutina, 10 hábito)'
);

select is(
  (select count(*)::int from public.template_catalog where kind = 'project' and status = 'published'),
  11,
  'Las 11 plantillas de proyecto que había en código están sembradas'
);

-- ---------------------------------------------------------------------------
-- Un usuario NORMAL: ve lo publicado, no ve borradores, no escribe nada
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select isnt_empty(
  $$ select 1 from public.template_catalog where slug = 'savers-60' $$,
  'Un usuario normal SÍ ve las plantillas publicadas'
);

select is_empty(
  $$ select 1 from public.template_catalog where slug = 'borrador-de-prueba' $$,
  'Un usuario normal NO ve los borradores'
);

-- Sin política de insert que le aplique, la fila se rechaza (42501).
select throws_ok(
  $$ insert into public.template_catalog (kind, slug, payload)
     values ('habit', 'colada', '{"id":"colada"}'::jsonb) $$,
  '42501',
  null,
  'Un usuario normal NO puede añadir plantillas al catálogo de todos'
);

-- Un update sin política no lanza: no encuentra filas que actualizar. Se
-- comprueba el EFECTO, que es lo que importa.
select lives_ok(
  $$ update public.template_catalog set status = 'draft' where slug = 'savers-60' $$,
  'El update de un usuario normal no revienta...'
);
select is(
  (select status from public.template_catalog where slug = 'savers-60'),
  'published',
  '...pero tampoco cambia nada: la plantilla sigue publicada'
);

-- ---------------------------------------------------------------------------
-- El ADMINISTRADOR: ve borradores y escribe. Datos ajenos, ni uno.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select isnt_empty(
  $$ select 1 from public.template_catalog where slug = 'borrador-de-prueba' $$,
  'El administrador SÍ ve los borradores'
);

-- BR-012: administrar contenido no es ver a la gente.
select is_empty(
  $$ select 1 from public.profiles where user_id = 'b2222222-2222-4222-8222-222222222222' $$,
  'Ser administrador NO le deja ver el perfil de otro usuario (BR-012)'
);

select * from finish();
rollback;
