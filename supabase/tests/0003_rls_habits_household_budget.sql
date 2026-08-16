-- 0003_rls_habits_household_budget.sql — pgTAP: Hábitos, Hogar, Presupuesto.
-- ⚠️ NO EJECUTADO en el entorno del asistente. Correr con: `supabase test db`.
-- (Este archivo NO fue reportado como fallido en la corrida de CI; se incluye
-- sin cambios de lógica para mantener el set de pruebas consistente.)

begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('99999999-9999-4999-8999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'titular@test.local'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('99999999-9999-4999-8999-999999999999', 'Titular'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Otro')
on conflict (user_id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-4999-8999-999999999999', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Ocupación + hábito ligado
insert into public.occupations (id, user_id, title, start_time, end_time, category, occ_date)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '99999999-9999-4999-8999-999999999999', 'Lectura', '20:30', '21:00', 'Personal', current_date);

insert into public.habits (id, user_id, name, occupation_id)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '99999999-9999-4999-8999-999999999999', 'Leer', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- FR-HAB-006/BR-026: eliminar la ocupación NO borra el hábito; solo lo desliga
delete from public.occupations where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select isnt_empty(
  $$ select 1 from public.habits where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' $$,
  'El hábito sobrevive a la eliminación de su ocupación (FR-HAB-006/BR-026)'
);
select is(
  (select occupation_id from public.habits where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  null,
  'occupation_id queda en null tras eliminar la ocupación (BR-026), no rompe la fila'
);

-- Hogar: miembro de hogar creado por el titular
insert into public.family_members (id, user_id, name, relationship, member_type)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '99999999-9999-4999-8999-999999999999', 'Ana', 'Cónyuge', 'Adulto');

select isnt_empty(
  $$ select 1 from public.family_members where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  'Titular ve su propio miembro de hogar (RLS positiva)'
);

-- Presupuesto: crear un concepto con costo mensual y aportaciones (FR-MNY-018/019)
insert into public.budgets (user_id, period, cycle, category, amount, monthly_cost, q1_amount, q2_amount)
values ('99999999-9999-4999-8999-999999999999', 'current', 'Quincenal', 'Alimentación', 2500, 5000, 2500, 2500);

select isnt_empty(
  $$ select 1 from public.budgets where user_id = '99999999-9999-4999-8999-999999999999' and category = 'Alimentación' $$,
  'Titular puede crear un concepto de presupuesto (RLS positiva)'
);

reset role;

-- NEGATIVA: otro usuario no ve ni el hábito, ni el miembro de hogar, ni el presupuesto
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select 1 from public.family_members where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  'Otro usuario NO ve al miembro de hogar del titular (NFR-PRV-003)'
);
select is_empty(
  $$ select 1 from public.habits where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' $$,
  'Otro usuario NO ve el hábito del titular (NFR-PRV-005/BR-027)'
);

select * from finish();
rollback;
