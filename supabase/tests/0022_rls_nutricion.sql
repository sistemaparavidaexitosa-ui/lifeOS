-- 0022_rls_nutricion.sql — pgTAP: el diario de nutrición es privado, la caché
-- de alimentos es compartida pero NO escribible, y el historial no se reescribe
-- solo (migración 0047).
--
-- Tres de estas aserciones no son de rutina y por eso se nombran: la que fija
-- que `authenticated` no puede escribir en `foods` (es la que justifica la
-- única tabla no privada del OS), la que exige `source_id` en un resultado
-- clave de nutrición, y la que comprueba que borrar un alimento de la caché
-- deja intacto lo que ya comiste.

begin;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email) values
  ('d1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nut-titular@test.local'),
  ('d2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nut-otro@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('d1111111-1111-4111-8111-111111111111', 'Titular Nutrición'),
  ('d2222222-2222-4222-8222-222222222222', 'Otro Nutrición')
on conflict (user_id) do nothing;

-- El esquema dice lo que la migración prometió
select has_table('public', 'nutrition_profiles', 'nutrition_profiles existe (0047)');
select has_table('public', 'body_measurements', 'body_measurements existe (0047)');
select has_table('public', 'food_entries', 'food_entries existe (0047)');
select has_column('public', 'foods', 'search', 'foods.search es la columna generada que indexa la búsqueda');
select hasnt_column('public', 'foods', 'user_id', 'foods NO tiene dueño: es caché compartida de datos públicos');

-- La caché la siembra el servidor (aquí, el rol de la migración).
insert into public.foods (id, source, source_ref, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g)
values ('d9999999-9999-4999-8999-999999999999', 'off', '3017620422003', 'Nutella', 'Ferrero', 539, 6.3, 57.5, 30.9);

select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.nutrition_profiles (user_id, sex, birth_date, height_cm, weight_kg)
values ('d1111111-1111-4111-8111-111111111111', 'Hombre', '1996-09-03', 180, 82);

insert into public.food_entries (id, user_id, local_date, meal, food_id, name, grams, kcal, protein_g, carbs_g, fat_g)
values ('d8888888-8888-4888-8888-888888888888', 'd1111111-1111-4111-8111-111111111111',
        '2026-09-03', 'Desayuno', 'd9999999-9999-4999-8999-999999999999', 'Nutella', 20, 108, 1.3, 11.5, 6.2);

insert into public.body_measurements (user_id, local_date, weight_kg)
values ('d1111111-1111-4111-8111-111111111111', '2026-09-03', 82);

-- Los checks que defienden el dato
select throws_ok(
  $$ insert into public.food_entries (user_id, local_date, meal, name, grams, kcal)
     values ('d1111111-1111-4111-8111-111111111111', '2026-09-03', 'Merienda', 'Algo', 100, 100) $$,
  '23514', null, 'Una comida fuera de las cuatro no se puede insertar'
);

select throws_ok(
  $$ insert into public.food_entries (user_id, local_date, meal, name, grams, kcal)
     values ('d1111111-1111-4111-8111-111111111111', '2026-09-03', 'Cena', 'Aire', 0, 0) $$,
  '23514', null, 'Una entrada de 0 gramos no se puede insertar'
);

-- El suelo de calorías es una salvaguarda, no un rango razonable
select throws_ok(
  $$ update public.nutrition_profiles set kcal_override = 600
     where user_id = 'd1111111-1111-4111-8111-111111111111' $$,
  '23514', null, 'Un objetivo de 600 kcal lo impide la BASE, no la aplicación'
);

-- Un peso por día: pesarse dos veces no son dos datos
select throws_ok(
  $$ insert into public.body_measurements (user_id, local_date, weight_kg)
     values ('d1111111-1111-4111-8111-111111111111', '2026-09-03', 81) $$,
  '23505', null, 'Dos pesos para el mismo día chocan con el unique'
);

-- LA aserción que justifica que `foods` no sea privada: se lee, no se escribe
select isnt_empty(
  $$ select 1 from public.foods where source_ref = '3017620422003' $$,
  'Cualquier autenticado LEE foods: es copia de una fila pública y no dice quién la buscó'
);

select throws_ok(
  $$ insert into public.foods (source, source_ref, name, kcal_100g)
     values ('off', '0000000000000', 'Envenenada', 1) $$,
  '42501', null,
  'authenticated NO puede escribir en foods (GRANT, no RLS): si no, cualquiera envenena la caché de todos'
);

-- key_results: 'nutrition' exige source_id, porque no es 'manual'
insert into public.personal_goals (id, user_id, title, area, horizon)
values ('d7777777-7777-4777-8777-777777777777', 'd1111111-1111-4111-8111-111111111111', 'Comer mejor', 'Salud', '2026-12-31');

select lives_ok(
  $$ insert into public.key_results (goal_id, title, source_kind, source_id, source_metric, target, unit)
     values ('d7777777-7777-4777-8777-777777777777', 'Adherencia', 'nutrition',
             'd1111111-1111-4111-8111-111111111111', 'adherencia', 80, '%') $$,
  'key_results acepta source_kind = nutrition apuntando al perfil corporal'
);

select throws_ok(
  $$ insert into public.key_results (goal_id, title, source_kind, source_id, target)
     values ('d7777777-7777-4777-8777-777777777777', 'Sin fuente', 'nutrition', null, 80) $$,
  '23514', null,
  'key_results_source_shape sigue vigente: nutrition no es manual y exige source_id'
);

-- Privacidad: el diario es dato de salud (BR-027)
select set_config('request.jwt.claims', json_build_object('sub', 'd2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.food_entries where user_id = 'd1111111-1111-4111-8111-111111111111' $$,
  'Otro usuario NO ve tu diario de comidas'
);

select is_empty(
  $$ select 1 from public.nutrition_profiles where user_id = 'd1111111-1111-4111-8111-111111111111' $$,
  'Otro usuario NO ve tu perfil corporal'
);

select is_empty(
  $$ select 1 from public.body_measurements where user_id = 'd1111111-1111-4111-8111-111111111111' $$,
  'Otro usuario NO ve tus pesos'
);

-- Borrar el alimento de la caché NO reescribe el historial: los macros están
-- copiados en la fila y `food_id` es `on delete set null`.
set local role postgres;
delete from public.foods where id = 'd9999999-9999-4999-8999-999999999999';

select results_eq(
  $$ select food_id is null, kcal::numeric from public.food_entries
     where id = 'd8888888-8888-4888-8888-888888888888' $$,
  $$ values (true, 108::numeric) $$,
  'Borrar el alimento de la caché deja el diario intacto: el pasado no se reescribe'
);

select * from finish();
rollback;
