-- supabase/tests/0009_occupation_days.sql — pgTAP: días de la semana y
-- propiedad del bloque en las ocupaciones (0028).
--
-- Lo que estas pruebas cuidan: que la migración sea NEUTRA para lo que ya
-- existía. La columna `days` se creó a mano en producción sin migración, y
-- 0028 la adopta; si el default o el constraint no coincidieran con los de
-- producción, las dos bases seguirían divergiendo.

begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dias-titular@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Titular Días')
on conflict (user_id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1) El default son los SIETE días: una ocupación recurrente creada sin tocar
--    `days` se sigue comportando como antes de que la columna existiera.
insert into public.occupations (id, user_id, title, start_time, end_time, category, recurring)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Todos los días', '06:00', '07:00', 'Personal', true);

select is(
  (select days from public.occupations where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '{0,1,2,3,4,5,6}'::smallint[],
  'Sin especificar days, una ocupación recurrente recibe los siete días (migración neutra)'
);

-- 2) La convención es JS (0=domingo … 6=sábado), no ISO: el 0 es válido.
insert into public.occupations (id, user_id, title, start_time, end_time, category, recurring, days)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Dom-Lun-Mié', '08:00', '09:00', 'Personal', true, '{0,1,3}');

select is(
  (select days from public.occupations where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  '{0,1,3}'::smallint[],
  'El 0 (domingo) es un día válido: la convención es la de Date.getUTCDay(), no ISO-8601'
);

-- 3) El 7 NO es válido: si alguien escribe pensando en ISO, la base lo frena
--    en vez de guardar un día que no existe.
select throws_ok(
  $$ insert into public.occupations (user_id, title, start_time, end_time, category, recurring, days)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ISO por error', '10:00', '11:00', 'Personal', true, '{7}') $$,
  '23514',
  null,
  'El día 7 se rechaza: en esta convención el domingo es 0, no 7'
);

-- 4) Un arreglo vacío se rechaza: una ocupación que no se muestra ningún día
--    es un estado sin sentido.
select throws_ok(
  $$ insert into public.occupations (user_id, title, start_time, end_time, category, recurring, days)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ningún día', '10:00', '11:00', 'Personal', true, '{}') $$,
  '23514',
  null,
  'days vacío se rechaza: al menos un día'
);

-- 5) source por default es 'manual': todo lo que ya existía lo creó el usuario.
select is(
  (select source from public.occupations where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'manual',
  'source por default es manual, que es lo que era toda ocupación antes de esta columna'
);

-- 6) source solo admite los dos valores del modelo.
select throws_ok(
  $$ update public.occupations set source = 'importada' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  '23514',
  null,
  'source solo admite manual o routine'
);

select * from finish();
rollback;
