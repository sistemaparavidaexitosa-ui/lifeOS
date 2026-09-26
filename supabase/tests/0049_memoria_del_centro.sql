-- supabase/tests/0049_memoria_del_centro.sql — pgTAP: migración 0079 (D-204).
begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f5555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memoria-a@test.local'),
  ('f6666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memoria-b@test.local')
on conflict (id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', 'f5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.memory_items (user_id, scope, text, origin, valid_until) values
  ('f5555555-5555-4555-8555-555555555555', 'preference', 'Prefiere gramos', 'centro', current_date + 90);
select is((select origin from public.memory_items where text = 'Prefiere gramos'), 'centro', 'El origen centro se admite (0079)');

insert into public.memory_items (user_id, scope, text, origin) values
  ('f5555555-5555-4555-8555-555555555555', 'preference', 'No trabajo sábados', 'user'),
  ('f5555555-5555-4555-8555-555555555555', 'goal', 'Correr un maratón', 'ai');
select is((select count(*)::int from public.memory_items where origin in ('user', 'ai', 'centro')), 3, 'user, ai y centro conviven');

select throws_ok(
  $$ insert into public.memory_items (user_id, scope, text, origin) values ('f5555555-5555-4555-8555-555555555555', 'preference', 'x', 'otro') $$,
  '23514', null, 'Un origen inventado se sigue rechazando'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f6666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.memory_items where origin = 'centro'), 0, 'La memoria del Centro es privada de su dueño');

select * from finish();
rollback;
