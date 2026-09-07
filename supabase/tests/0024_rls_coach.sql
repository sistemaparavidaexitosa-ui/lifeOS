-- 0024_rls_coach.sql — pgTAP: las propuestas del coach (migración 0053).
--
-- POR QUÉ EXISTE
-- `coach_proposals` es la segunda tabla del proyecto que guarda texto generado
-- a partir del contexto privado de una persona —«tu proyecto X no tiene
-- estructura», «tienes tres horas libres el jueves»—, y a diferencia de
-- `ai_chat_messages` esta se escribe SIN SESIÓN: la crea el despachador, con la
-- llave de servicio, desde un reloj. Que el service_role pueda escribirla es
-- justo lo que hace imprescindible comprobar que nadie más la lee.
--
-- Se inserta SUPLANTANDO al usuario, no sembrando como superusuario: sembrado
-- saltaría la política, que es lo que se prueba.

begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('d1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coach-yo@test.local'),
  ('d2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coach-otro@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('d1111111-1111-4111-8111-111111111111', 'Coach Yo'),
  ('d2222222-2222-4222-8222-222222222222', 'Coach Otro')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- El mensaje del coach y su propuesta, escritos por el propio usuario.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.ai_chat_messages (id, user_id, role, content) values
  ('d3333333-3333-4333-8333-333333333333', 'd1111111-1111-4111-8111-111111111111', 'assistant',
   'Buenos días. Tu proyecto "Mudanza" tiene 9 tareas sin ninguna fase.');

insert into public.coach_proposals (id, user_id, message_id, tipo, titulo, payload) values
  ('d4444444-4444-4444-8444-444444444444', 'd1111111-1111-4111-8111-111111111111',
   'd3333333-3333-4333-8333-333333333333', 'estructura', 'Dividir "Mudanza" en fases',
   '{"projectId": "00000000-0000-4000-8000-000000000000"}'::jsonb);

select is(
  (select status from public.coach_proposals where id = 'd4444444-4444-4444-8444-444444444444'),
  'pending',
  'Una propuesta nace pendiente: el coach propone, la persona decide'
);

-- El check del tipo es lo que impide que llegue una propuesta que la UI no
-- sabría pintar ni el servidor ejecutar.
select throws_ok(
  $$ insert into public.coach_proposals (user_id, message_id, tipo, titulo)
     values ('d1111111-1111-4111-8111-111111111111', 'd3333333-3333-4333-8333-333333333333', 'transferencia', 'Mover dinero') $$,
  '23514',
  null,
  'Solo los cinco tipos que tienen una acción detrás'
);

-- ---------------------------------------------------------------------------
-- El otro usuario: ni lee, ni escribe en tu nombre, ni acepta lo tuyo.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'd2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.coach_proposals where user_id = 'd1111111-1111-4111-8111-111111111111' $$,
  'Las propuestas de otra persona no se ven: nombran sus proyectos y su agenda (BR-012)'
);

select throws_ok(
  $$ insert into public.coach_proposals (user_id, message_id, tipo, titulo)
     values ('d1111111-1111-4111-8111-111111111111', 'd3333333-3333-4333-8333-333333333333', 'tarea', 'Tarea que no pediste') $$,
  'new row violates row-level security policy for table "coach_proposals"',
  'Nadie puede meterle una propuesta a otro: el botón de aceptar crea cosas de verdad'
);

-- Un update que no casa ninguna fila no lanza: la prueba es que la fila SIGUE
-- pendiente después, no que la sentencia falle.
update public.coach_proposals set status = 'accepted' where id = 'd4444444-4444-4444-8444-444444444444';

select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select status from public.coach_proposals where id = 'd4444444-4444-4444-8444-444444444444'),
  'pending',
  'Un extraño no puede aceptar una propuesta en tu nombre'
);

-- Borrar el turno se lleva la propuesta: un botón sin la observación que lo
-- motivó no es un botón, es una trampa.
delete from public.ai_chat_messages where id = 'd3333333-3333-4333-8333-333333333333';

select is_empty(
  $$ select 1 from public.coach_proposals where id = 'd4444444-4444-4444-8444-444444444444' $$,
  'La propuesta se borra con el mensaje que la explicaba'
);

select * from finish();
rollback;
