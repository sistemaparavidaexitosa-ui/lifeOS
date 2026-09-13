-- 0034_aristas_de_la_ia.sql — pgTAP: la cola única y la única puerta de `origin = 'ai'` (0062).
--
-- POR QUÉ EXISTE
-- 0054 dejó escrito que una arista de IA «pasa por su cola de propuestas antes
-- de existir», y la política de inserción solo admite `origin = 'user'`. Esta
-- suite prueba que la puerta nueva respeta las dos cosas: que solo abre con una
-- propuesta TUYA y PENDIENTE, y que la frontera de BR-012 manda también aquí.

begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email) values
  ('e1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ia-ana@test.local'),
  ('e2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ia-beto@test.local')
on conflict (id) do nothing;

insert into public.personal_goals (id, user_id, title, area, status)
values ('e1cc0000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'Correr un maratón', 'Salud', 'Activa');
insert into public.routines (id, user_id, name)
values ('e1dd0000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'Tardes');
insert into public.habits (id, user_id, name, routine_id)
values ('e1ee0000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'Salir a trotar', 'e1dd0000-0000-4000-8000-000000000001');

insert into public.workspaces (id, owner_id, name, is_personal)
values ('e1999999-9999-4999-8999-999999999999', 'e1111111-1111-4111-8111-111111111111', 'Club', false);
insert into public.memberships (workspace_id, user_id, user_name, role, status)
values ('e1999999-9999-4999-8999-999999999999', 'e1111111-1111-4111-8111-111111111111', 'Ana', 'Owner', 'Active');
insert into public.projects (id, owner_id, workspace_id, title, status)
values ('e1aa0000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'e1999999-9999-4999-8999-999999999999', 'Carrera del club', 'Active');

-- Dos propuestas de Ana: una legal y una que cruzaría la frontera.
insert into public.coach_proposals (id, user_id, origen, tipo, titulo, detalle, payload, fingerprint) values
  ('e1ff0000-0000-4000-8000-000000000001', 'e1111111-1111-4111-8111-111111111111', 'grafo', 'arista',
   'Conectar «Salir a trotar» con «Correr un maratón»', '',
   jsonb_build_object('source', 'e1ee0000-0000-4000-8000-000000000001', 'target', 'e1cc0000-0000-4000-8000-000000000001', 'rel', 'supports', 'confianza', '0.8'),
   'arista:supports:e1ee0000-0000-4000-8000-000000000001:e1cc0000-0000-4000-8000-000000000001'),
  ('e1ff0000-0000-4000-8000-000000000002', 'e1111111-1111-4111-8111-111111111111', 'grafo', 'arista',
   'Conectar «Carrera del club» con «Correr un maratón»', '',
   jsonb_build_object('source', 'e1aa0000-0000-4000-8000-000000000001', 'target', 'e1cc0000-0000-4000-8000-000000000001', 'rel', 'supports'),
   'arista:supports:e1aa0000-0000-4000-8000-000000000001:e1cc0000-0000-4000-8000-000000000001');

create or replace function pg_temp.como(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true)::void;
$$;

-- 1-3) La tabla
select throws_ok(
  $$ insert into public.coach_proposals (user_id, tipo, titulo)
     values ('e1111111-1111-4111-8111-111111111111', 'tarea', 'Sin mensaje y del coach') $$,
  '23514', null,
  'Una propuesta del coach sigue necesitando el turno que la explica'
);
select throws_ok(
  $$ insert into public.coach_proposals (user_id, origen, tipo, titulo, fingerprint)
     values ('e1111111-1111-4111-8111-111111111111', 'grafo', 'arista', 'Repetida',
             'arista:supports:e1ee0000-0000-4000-8000-000000000001:e1cc0000-0000-4000-8000-000000000001') $$,
  '23505', null,
  'La misma sugerencia no entra dos veces, aunque la primera ya se haya descartado'
);
select ok(
  not has_function_privilege('anon', 'public.graph_aceptar_arista(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.graph_aceptar_arista(uuid)', 'execute'),
  'graph_aceptar_arista es para una sesión'
);

-- 4-7) Aceptar la legal
select pg_temp.como('e1111111-1111-4111-8111-111111111111');
set local role authenticated;

select is(
  public.graph_aceptar_arista('e1ff0000-0000-4000-8000-000000000001'),
  'creada',
  'Ana acepta su propuesta y la arista se crea'
);
select is(
  (select origin || '|' || created_by::text from public.graph_edges
    where rel_type = 'supports'
      and source_id = (select id from public.graph_nodes where entity_id = 'e1ee0000-0000-4000-8000-000000000001')
      and target_id = (select id from public.graph_nodes where entity_id = 'e1cc0000-0000-4000-8000-000000000001')),
  'ai|e1111111-1111-4111-8111-111111111111',
  'La arista queda con origin = ai y firmada por quien la aceptó'
);
select is(
  (select status from public.coach_proposals where id = 'e1ff0000-0000-4000-8000-000000000001'),
  'accepted',
  'La propuesta queda aceptada en la misma transacción'
);
select throws_ok(
  $$ select public.graph_aceptar_arista('e1ff0000-0000-4000-8000-000000000001') $$,
  'P0002', null,
  'Pulsar dos veces no crea dos cosas'
);

-- 8) La frontera manda también aquí
select is(
  public.graph_aceptar_arista('e1ff0000-0000-4000-8000-000000000002'),
  'frontera',
  'Un proyecto de un espacio compartido no se une a una meta privada, aunque lo proponga la IA'
);
select is(
  (select status from public.coach_proposals where id = 'e1ff0000-0000-4000-8000-000000000002'),
  'fallida',
  'Y la propuesta queda fallida, no pendiente para siempre'
);

-- 9) La política de inserción no se abrió
select throws_ok(
  $$ insert into public.graph_edges (source_id, rel_type, target_id, origin, created_by)
     values ((select id from public.graph_nodes where entity_id = 'e1ee0000-0000-4000-8000-000000000001'),
             'related_to',
             (select id from public.graph_nodes where entity_id = 'e1cc0000-0000-4000-8000-000000000001'),
             'ai', 'e1111111-1111-4111-8111-111111111111') $$,
  '42501', null,
  'Desde el cliente sigue sin poder escribirse una arista ai directamente'
);

-- 10) Otra persona no acepta lo de Ana
reset role;
update public.coach_proposals set status = 'pending' where id = 'e1ff0000-0000-4000-8000-000000000002';
select pg_temp.como('e2222222-2222-4222-8222-222222222222');
set local role authenticated;
select throws_ok(
  $$ select public.graph_aceptar_arista('e1ff0000-0000-4000-8000-000000000002') $$,
  'P0002', null,
  'Beto no puede aceptar una propuesta de Ana'
);

select * from finish();
rollback;
