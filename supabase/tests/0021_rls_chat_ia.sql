-- 0021_rls_chat_ia.sql — pgTAP: el chat de IA transversal (migración 0045).
--
-- POR QUÉ EXISTE
-- `ai_chat_messages` es la primera tabla del proyecto que guarda TEXTO GENERADO
-- a partir del contexto privado de una persona: una respuesta puede nombrar su
-- deuda, su presupuesto o sus hábitos. El filtro de privacidad de
-- `src/lib/insights/context.ts` decide qué entra al modelo; esto comprueba lo
-- otro, que es lo que sale de la base — y que nadie más lo lee.
--
-- Los turnos se insertan SUPLANTANDO al usuario, no sembrados como
-- superusuario: sembrados saltarían la política, que es justo lo que se prueba.

begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('c1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-yo@test.local'),
  ('c2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-otro@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('c1111111-1111-4111-8111-111111111111', 'Chat Yo'),
  ('c2222222-2222-4222-8222-222222222222', 'Chat Otro')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Un turno de usuario y su respuesta, escritos por el propio usuario.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.ai_chat_messages (id, user_id, role, content) values
  ('c3333333-3333-4333-8333-333333333333', 'c1111111-1111-4111-8111-111111111111', 'user', '¿en qué me enfoco esta semana?');

insert into public.ai_chat_messages (id, user_id, role, content, fact_ids) values
  ('c4444444-4444-4444-8444-444444444444', 'c1111111-1111-4111-8111-111111111111', 'assistant',
   'Tu presupuesto de comida va al 92% a mitad de quincena.', array['money:budget:comida']);

select is(
  (select count(*)::int from public.ai_chat_messages where user_id = 'c1111111-1111-4111-8111-111111111111'),
  2,
  'Cada quien escribe y lee su propia conversación'
);

select is(
  (select fact_ids from public.ai_chat_messages where id = 'c4444444-4444-4444-8444-444444444444'),
  array['money:budget:comida'],
  'fact_ids conserva lo que el modelo citó: la respuesta se puede auditar después'
);

-- El check del rol es la única forma que hay de que no se cuele un tercer tipo
-- de turno que la UI no sabría pintar.
select throws_ok(
  $$ insert into public.ai_chat_messages (user_id, role, content)
     values ('c1111111-1111-4111-8111-111111111111', 'system', 'inyectado') $$,
  '23514',
  null,
  'El rol solo puede ser user o assistant'
);

-- ---------------------------------------------------------------------------
-- El otro usuario: ni lee, ni escribe en tu nombre, ni borra lo tuyo.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'c2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.ai_chat_messages where user_id = 'c1111111-1111-4111-8111-111111111111' $$,
  'La conversación de otra persona no se ve: puede nombrar su deuda o su presupuesto (BR-012)'
);

select throws_ok(
  $$ insert into public.ai_chat_messages (user_id, role, content)
     values ('c1111111-1111-4111-8111-111111111111', 'user', 'me cuelo en tu chat') $$,
  'new row violates row-level security policy for table "ai_chat_messages"',
  'Nadie puede escribir un turno en nombre de otro'
);

-- Un delete que no casa ninguna fila no lanza: la prueba es que la fila SIGUE
-- ahí después, no que la sentencia falle.
delete from public.ai_chat_messages where id = 'c3333333-3333-4333-8333-333333333333';

select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from public.ai_chat_messages where user_id = 'c1111111-1111-4111-8111-111111111111'),
  2,
  'Un extraño no puede borrar tu conversación'
);

select * from finish();
rollback;
