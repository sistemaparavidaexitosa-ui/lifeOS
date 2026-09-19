-- 0041_arranque_guiado.sql — pgTAP: migración 0068 (D-165).
--
-- `ritual_policy` es la SEGUNDA tabla del esquema sin `user_id`, después de
-- `template_catalog` (0044), así que su prueba tampoco puede apoyarse en el
-- patrón de «user_id = auth.uid()» que usan casi todas las demás. Lo que se fija
-- aquí son cuatro invariantes que se rompen callados:
--
--   1. La política NACE APAGADA. Si alguien cambia ese default, media base de
--      usuarios se encuentra un overlay una mañana sin que nadie lo decidiera.
--   2. Un no-admin la LEE (el layout la necesita en cada carga) y NO la escribe.
--      Y no la escribe «en silencio»: se comprueba que el valor sigue igual,
--      porque un UPDATE que la RLS filtra NO lanza — afecta cero filas. Una
--      prueba con `throws_ok` aquí pasaría en verde con la política abierta.
--   3. El vocabulario de pasos lo impone la BASE, no solo el dominio: una
--      versión futura de la pantalla no puede colar un paso que nadie sabe
--      pintar.
--   4. `ritual_gate()` es `security invoker`: contesta sobre quien la llama y
--      no es una puerta trasera al historial de otro.

begin;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email) values
  ('c1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ritual-admin@test.local'),
  ('c2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ritual-normal@test.local')
on conflict (id) do nothing;

-- El trigger de 0002 ya creó las dos filas de `profiles`. Solo una es admin.
update public.profiles set is_admin = true where user_id = 'c1111111-1111-4111-8111-111111111111';

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------
select has_table('public', 'ritual_policy', 'ritual_policy existe (0068)');
select has_table('public', 'ritual_prefs', 'ritual_prefs existe (0068)');
select has_table('public', 'ritual_runs', 'ritual_runs existe (0068)');
select has_function('public', 'ritual_gate', array['date'], 'ritual_gate(date) existe (0068)');

-- ---------------------------------------------------------------------------
-- UN USUARIO NORMAL: lee la política, no la toca
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'c2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from public.ritual_policy),
  1,
  'Un usuario normal VE la política: el layout la necesita en cada carga'
);

select is(
  (select enabled from public.ritual_policy),
  false,
  'La política NACE APAGADA: aplicar 0068 no le cambia la mañana a nadie'
);

-- Un UPDATE que la RLS filtra afecta cero filas y NO lanza. Por eso se afirma
-- sobre el valor y no sobre la excepción.
update public.ritual_policy set enabled = true;
select is(
  (select enabled from public.ritual_policy),
  false,
  'Un no-admin no enciende la política aunque llame al UPDATE a mano'
);

select throws_ok(
  $$ insert into public.ritual_policy (id, enabled) values (true, true) $$,
  '42501', null,
  'Un no-admin no puede insertar en la política'
);

-- Su propia preferencia sí es suya, pero el vocabulario lo impone la base.
insert into public.ritual_prefs (user_id, steps_off)
  values ('c2222222-2222-4222-8222-222222222222', '{affirmation}');

select throws_ok(
  $$ update public.ritual_prefs set steps_off = '{paso-inventado}' $$,
  '23514', null,
  'Un paso que el dominio no sabe pintar no entra en steps_off'
);

-- Su ejecución de hoy.
insert into public.ritual_runs (user_id, local_date, steps_total)
  values ('c2222222-2222-4222-8222-222222222222', '2026-09-19', 5);

select is(
  (select run_exists from public.ritual_gate('2026-09-19')),
  true,
  'ritual_gate() ve la ejecución de quien la llama'
);

select is(
  (select pref_steps_off from public.ritual_gate('2026-09-19')),
  '{affirmation}'::text[],
  'ritual_gate() devuelve la preferencia de quien la llama'
);

-- ---------------------------------------------------------------------------
-- EL ADMINISTRADOR: sí escribe la política, y la base sigue validándolo
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

update public.ritual_policy set enabled = true;
select is(
  (select enabled from public.ritual_policy),
  true,
  'El administrador sí enciende la política'
);

select throws_ok(
  $$ insert into public.ritual_policy (id) values (true) $$,
  '23505', null,
  'La política es una fila y solo una: la unicidad la impone el tipo booleano'
);

select throws_ok(
  $$ update public.ritual_policy set window_start = 12, window_end = 4 $$,
  '23514', null,
  'Una ventana que empieza después de terminar no se muestra nunca, y se rechaza'
);

select throws_ok(
  $$ update public.ritual_policy set steps = '{greeting,paso-inventado}' $$,
  '23514', null,
  'El vocabulario de pasos lo impone la base, no solo el dominio'
);

select throws_ok(
  $$ update public.ritual_policy set frequency = 'Cada dos martes' $$,
  '23514', null,
  'frequency usa los mismos cuatro valores que routines.frequency (0046)'
);

-- ---------------------------------------------------------------------------
-- AISLAMIENTO (BR-012): ser admin no abre ni una fila ajena
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.ritual_prefs),
  0,
  'El administrador NO ve la preferencia de otra persona: is_admin es contenido, no datos'
);

select is(
  (select count(*)::int from public.ritual_runs),
  0,
  'El administrador NO ve la ejecución de otra persona'
);

select is(
  (select run_exists from public.ritual_gate('2026-09-19')),
  false,
  'ritual_gate() es security invoker: no es una puerta trasera al historial de otro'
);

select * from finish();
rollback;
