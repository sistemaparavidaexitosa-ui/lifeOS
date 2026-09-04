-- 0023_rls_notificaciones.sql — pgTAP: la frontera de privilegio de las
-- notificaciones push (migraciones 0049 y 0050).
--
-- Lo que se prueba aquí es lo que ninguna prueba de dominio puede cubrir:
--
--   1. que las claves de un dispositivo NO se puedan leer desde otra cuenta —
--      con `endpoint`, `p256dh` y `auth` cualquiera puede hacer sonar el
--      teléfono de otro;
--   2. que `notifications` no tenga puerta de INSERT directa, o la bandeja
--      sería un buzón abierto;
--   3. que `enqueue_notification` sí deje avisar a un compañero de espacio y
--      NO a un desconocido, y que sea idempotente.

begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email) values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'noti-una@test.local'),
  ('a2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'noti-companera@test.local'),
  ('a3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'noti-extrana@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('a1111111-1111-4111-8111-111111111111', 'Una'),
  ('a2222222-2222-4222-8222-222222222222', 'Companera'),
  ('a3333333-3333-4333-8333-333333333333', 'Extrana')
on conflict (user_id) do nothing;

-- Un espacio compartido por Una y Companera. Extrana se queda fuera.
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.workspaces (id, owner_id, name)
values ('b1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'Espacio avisos');

set local role postgres;
insert into public.memberships (workspace_id, user_id, user_name, role, status) values
  ('b1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'Una', 'Owner', 'Active'),
  ('b1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222', 'Companera', 'Member', 'Active')
on conflict (workspace_id, user_id) do nothing;

-- Una suscripción de la compañera, creada por debajo de la RLS para poder
-- comprobar luego que Una NO la ve.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('a2222222-2222-4222-8222-222222222222', 'https://fcm.example/de-la-companera', 'clave-publica', 'secreto');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

-- =============================================================================
-- 1) Las claves de un dispositivo ajeno son invisibles
-- =============================================================================
select is_empty(
  $$ select 1 from public.push_subscriptions where user_id = 'a2222222-2222-4222-8222-222222222222' $$,
  'Una no ve la suscripción de la compañera: endpoint+p256dh+auth bastan para empujarle notificaciones'
);

select throws_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values ('a2222222-2222-4222-8222-222222222222', 'https://fcm.example/suplantada', 'x', 'y') $$,
  '42501',
  null,
  'Nadie puede registrar un dispositivo a nombre de otro'
);

select lives_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values ('a1111111-1111-4111-8111-111111111111', 'https://fcm.example/de-una', 'x', 'y') $$,
  'La propia sí se registra'
);

-- =============================================================================
-- 2) `notifications` no tiene puerta de INSERT
-- =============================================================================
select throws_ok(
  $$ insert into public.notifications (user_id, kind, title, href, dedupe_key)
     values ('a2222222-2222-4222-8222-222222222222', 'mention', 'Falso', '/execution', 'mention:falso') $$,
  '42501',
  null,
  'No se puede escribir directamente en la bandeja de otro: la bandeja no es un buzón abierto'
);

select throws_ok(
  $$ insert into public.notifications (user_id, kind, title, href, dedupe_key)
     values ('a1111111-1111-4111-8111-111111111111', 'mention', 'Ni la mía', '/execution', 'mention:propia') $$,
  '42501',
  null,
  'Ni siquiera la propia: se entra por enqueue_notification o por service_role'
);

-- =============================================================================
-- 3) `enqueue_notification`: compañera sí, desconocida no, y sin duplicar
-- =============================================================================
select isnt(
  public.enqueue_notification(
    'a2222222-2222-4222-8222-222222222222', 'mention', 'Tarea', 'Te mencioné', '/execution?task=1', 'mention:c1'
  ),
  null,
  'Se puede avisar a alguien del mismo espacio'
);

select is(
  public.enqueue_notification(
    'a2222222-2222-4222-8222-222222222222', 'mention', 'Tarea', 'Te mencioné', '/execution?task=1', 'mention:c1'
  ),
  null,
  'La misma dedupe_key devuelve NULL en vez de crear un segundo aviso'
);

select throws_ok(
  $$ select public.enqueue_notification(
       'a3333333-3333-4333-8333-333333333333', 'mention', 'Hola', '', '/execution', 'mention:intruso'
     ) $$,
  null,
  null,
  'No se puede avisar a alguien con quien no se comparte ningún espacio'
);

-- El recuento se hace desde la sesión de QUIEN RECIBE, no de quien avisó.
-- Contarlo como Una daría cero y no porque falte la fila: es que la RLS de
-- `notifications` no le enseña la bandeja de otro. Ese cero, leído deprisa,
-- parecería un fallo de idempotencia y es justo lo contrario.
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from public.notifications where dedupe_key = 'mention:c1'),
  1,
  'La compañera tiene UNA fila, no dos: el reloj puede reintentar sin repetir el aviso'
);

select is_empty(
  $$ select 1 from public.push_subscriptions where user_id = 'a1111111-1111-4111-8111-111111111111' $$,
  'Y la simetría se cumple: la compañera tampoco ve el dispositivo de Una'
);

select * from finish();
rollback;
