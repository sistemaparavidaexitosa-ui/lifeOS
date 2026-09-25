-- 0047_movimientos_de_inversion.sql — pgTAP: migración 0077.
--
-- Los movimientos son la verdad y `investments` guarda el resumen. Lo que se
-- prueba: que el trigger resume con la MISMA semántica que la curva en TS
-- (los casos C1…C5 son `CASOS_COMPARTIDOS` de curva-inversion.ts, a mano), que
-- el relleno conserva los números que había, y que nadie ve ni escribe los
-- movimientos de otra persona.

begin;
select plan(23);

insert into auth.users (id, instance_id, aud, role, email) values
  ('e8111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mov-duena@test.local'),
  ('e8222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mov-otra@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('e8111111-1111-4111-8111-111111111111', 'Dueña Mov'),
  ('e8222222-2222-4222-8222-222222222222', 'Otra Mov')
on conflict (user_id) do nothing;

-- Grants, antes de cambiar de rol.
select ok(
  not has_function_privilege('anon', 'public.crear_posicion(text,text,text,text,numeric,text,text,numeric,date,uuid)', 'execute'),
  'anon no puede llamar a crear_posicion'
);
select ok(
  not has_table_privilege('anon', 'public.investment_movements', 'select'),
  'anon no puede leer investment_movements'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.investments (id, user_id, kind, name, as_of) values
  ('e8000001-0000-4000-8000-000000000001', 'e8111111-1111-4111-8111-111111111111', 'fija', 'C1', '2025-12-01'),
  ('e8000002-0000-4000-8000-000000000002', 'e8111111-1111-4111-8111-111111111111', 'fija', 'C2', '2025-12-01'),
  ('e8000003-0000-4000-8000-000000000003', 'e8111111-1111-4111-8111-111111111111', 'fija', 'C3', '2025-12-01'),
  ('e8000004-0000-4000-8000-000000000004', 'e8111111-1111-4111-8111-111111111111', 'fija', 'C4', '2025-12-01'),
  ('e8000005-0000-4000-8000-000000000005', 'e8111111-1111-4111-8111-111111111111', 'fija', 'C5', '2025-12-01'),
  ('e8000007-0000-4000-8000-000000000007', 'e8111111-1111-4111-8111-111111111111', 'fija', 'Perdida', '2025-12-01');

insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on, created_at) values
  ('e8111111-1111-4111-8111-111111111111', 'e8000001-0000-4000-8000-000000000001', 'aportacion', 1000, '2026-01-01', '2026-01-01T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000001-0000-4000-8000-000000000001', 'aportacion', 500, '2026-01-02', '2026-01-02T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000001-0000-4000-8000-000000000001', 'rendimiento', 20, '2026-01-03', '2026-01-03T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000001-0000-4000-8000-000000000001', 'retiro', 100, '2026-01-04', '2026-01-04T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000002-0000-4000-8000-000000000002', 'aportacion', 1000, '2026-01-01', '2026-01-01T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000002-0000-4000-8000-000000000002', 'valuacion', 1100, '2026-01-02', '2026-01-02T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000002-0000-4000-8000-000000000002', 'aportacion', 200, '2026-01-03', '2026-01-03T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000003-0000-4000-8000-000000000003', 'aportacion', 1000, '2026-01-01', '2026-01-01T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000003-0000-4000-8000-000000000003', 'aportacion', 500, '2026-01-02', '2026-01-02T11:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000003-0000-4000-8000-000000000003', 'valuacion', 1600, '2026-01-02', '2026-01-02T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000004-0000-4000-8000-000000000004', 'valuacion', 900, '2026-01-01', '2026-01-01T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000004-0000-4000-8000-000000000004', 'valuacion', 950, '2026-01-01', '2026-01-01T11:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000005-0000-4000-8000-000000000005', 'aportacion', 1000, '2026-01-01', '2026-01-01T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000005-0000-4000-8000-000000000005', 'valuacion', 1200, '2026-01-02', '2026-01-02T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000005-0000-4000-8000-000000000005', 'retiro', 300, '2026-01-03', '2026-01-03T10:00:00Z');

select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C1'), array[1420, 1400]::numeric[], 'C1 sin valuación');
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C2'), array[1300, 1200]::numeric[], 'C2 valuación y luego flujo');
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C3'), array[1600, 1500]::numeric[], 'C3 flujo el mismo día que la valuación');
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C4'), array[950, 0]::numeric[], 'C4 dos valuaciones el mismo día');
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C5'), array[900, 700]::numeric[], 'C5 retiro después de valuar');
select is((select as_of from public.investments where name = 'C1'), '2026-01-04'::date, 'as_of = el último movimiento');

-- Borrar hasta dejarla vacía.
delete from public.investment_movements where investment_id = 'e8000004-0000-4000-8000-000000000004';
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C4'), array[0, 0]::numeric[], 'Sin movimientos: 0 y 0');
select is((select as_of from public.investments where name = 'C4'), '2026-01-01'::date, 'Sin movimientos: as_of intacto');

-- El relleno de la migración, con su MISMO SQL (sólo acotado a estas tres
-- filas). Los números no se mueven: ni el valor de una posición que ganó, ni
-- el 0 de una que lo perdió todo, ni una sin capital registrado.
insert into public.investments (id, user_id, kind, name, principal, valuation, as_of) values
  ('e8000008-0000-4000-8000-000000000008', 'e8111111-1111-4111-8111-111111111111', 'fija', 'RellA', 1000, 1234.5, '2026-05-01'),
  ('e8000009-0000-4000-8000-000000000009', 'e8111111-1111-4111-8111-111111111111', 'fija', 'RellB', 500, 0, '2026-05-01'),
  ('e8000010-0000-4000-8000-000000000010', 'e8111111-1111-4111-8111-111111111111', 'variable', 'RellC', 0, 700, '2026-05-01');
insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on, note, created_at)
select i.user_id, i.id, r.kind, r.amount, i.as_of, 'Saldo inicial (migración)', now() + r.orden * interval '1 second'
  from public.investments i
 cross join lateral (values ('aportacion', i.principal, 0), ('valuacion', i.valuation, 1)) as r(kind, amount, orden)
 where (i.principal > 0 or i.valuation > 0)
   and (r.kind = 'valuacion' or i.principal > 0)
   and not exists (select 1 from public.investment_movements m where m.investment_id = i.id)
   and i.name like 'Rell%';
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'RellA'), array[1234.5, 1000]::numeric[], 'Relleno: conserva el valor de una posición que ganó');
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'RellB'), array[0, 500]::numeric[], 'Relleno: conserva el 0 de una que lo perdió todo');
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'RellC'), array[700, 0]::numeric[], 'Relleno: sin capital, sólo la valuación');

-- Una valuación de 0 es legítima (la perdió toda); una aportación de 0, no.
insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on) values
  ('e8111111-1111-4111-8111-111111111111', 'e8000007-0000-4000-8000-000000000007', 'aportacion', 500, '2026-02-01'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000007-0000-4000-8000-000000000007', 'valuacion', 0, '2026-02-02');
select is((select valuation from public.investments where name = 'Perdida'), 0::numeric, 'Valuación en 0 se admite');
select throws_ok(
  $$insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on)
    values ('e8111111-1111-4111-8111-111111111111', 'e8000007-0000-4000-8000-000000000007', 'aportacion', 0, '2026-02-03')$$,
  '23514',
  null,
  'Una aportación de 0 no se admite'
);

-- crear_posicion: posición y aportación inicial, juntas.
select ok(
  public.crear_posicion('fija', 'CETES 28d', 'Banxico', '', 10.5, 'Estado de cuenta', 'MXN', 5000, '2026-03-01') is not null,
  'crear_posicion devuelve el id'
);
select is(
  (select array[valuation, principal]::numeric[] from public.investments where name = 'CETES 28d'),
  array[5000, 5000]::numeric[],
  'crear_posicion deja la aportación inicial como capital y valor'
);
select is(
  (select count(*)::int from public.investment_movements m join public.investments i on i.id = m.investment_id where i.name = 'CETES 28d'),
  1,
  'crear_posicion registra un movimiento'
);
select throws_ok(
  $$select public.crear_posicion('fija', 'Rota', '', '', 0, 'x', 'MXN', 0, '2026-03-01')$$,
  '23514',
  null,
  'crear_posicion sin aportación no crea nada'
);
select is((select count(*)::int from public.investments where name = 'Rota'), 0, 'Ni la posición queda a medias');

-- La otra persona.
select set_config('request.jwt.claims', json_build_object('sub', 'e8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.investment_movements), 0, 'La otra persona no ve movimientos ajenos');
select throws_ok(
  $$insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on)
    values ('e8222222-2222-4222-8222-222222222222', 'e8000001-0000-4000-8000-000000000001', 'aportacion', 1, '2026-02-01')$$,
  '42501',
  null,
  'Nadie registra movimientos en una posición ajena'
);
delete from public.investment_movements where investment_id = 'e8000001-0000-4000-8000-000000000001';

select set_config('request.jwt.claims', json_build_object('sub', 'e8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.investment_movements where investment_id = 'e8000001-0000-4000-8000-000000000001'),
  4,
  'Ni los borra'
);

select * from finish();
rollback;
