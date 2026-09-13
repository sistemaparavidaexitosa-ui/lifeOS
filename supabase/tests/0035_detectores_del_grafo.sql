-- 0035_detectores_del_grafo.sql — pgTAP: los detectores que alimentan la cola (0062).
--
-- POR QUÉ EXISTE
-- `graph_detectar_de` corre sin sesión y lee con `row_security = off`: lo que
-- devuelve se le enseña al modelo y acaba en un botón. Una fuga aquí es una
-- fuga hacia el proveedor Y hacia la pantalla. Esta suite prueba que cada
-- persona solo recibe candidatas con cosas que ya ve.

begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'det-ana@test.local'),
  ('f2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'det-beto@test.local'),
  ('f4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'det-extrana@test.local')
on conflict (id) do nothing;

-- Lo de Ana: una meta activa, un hábito suelto y un proyecto personal suelto.
insert into public.personal_goals (id, user_id, title, area, status) values
  ('f1cc0000-0000-4000-8000-000000000001', 'f1111111-1111-4111-8111-111111111111', 'Aprender francés', 'Aprendizaje', 'Activa'),
  ('f1cc0000-0000-4000-8000-000000000002', 'f1111111-1111-4111-8111-111111111111', 'Meta abandonada', 'Personal', 'Abandonada');
insert into public.routines (id, user_id, name)
values ('f1dd0000-0000-4000-8000-000000000001', 'f1111111-1111-4111-8111-111111111111', 'Noches');
insert into public.habits (id, user_id, name, routine_id)
values ('f1ee0000-0000-4000-8000-000000000001', 'f1111111-1111-4111-8111-111111111111', 'Duolingo', 'f1dd0000-0000-4000-8000-000000000001');
insert into public.projects (id, owner_id, workspace_id, title, status)
select 'f1aa0000-0000-4000-8000-000000000001', 'f1111111-1111-4111-8111-111111111111', w.id, 'Viaje a Lyon', 'Active'
from public.workspaces w where w.owner_id = 'f1111111-1111-4111-8111-111111111111' and w.is_personal;

-- Un espacio compartido con Beto y dos tareas casi iguales, más una cerrada.
insert into public.workspaces (id, owner_id, name, is_personal)
values ('f1999999-9999-4999-8999-999999999999', 'f1111111-1111-4111-8111-111111111111', 'Oficina', false);
insert into public.memberships (workspace_id, user_id, user_name, role, status) values
  ('f1999999-9999-4999-8999-999999999999', 'f1111111-1111-4111-8111-111111111111', 'Ana',  'Owner',  'Active'),
  ('f1999999-9999-4999-8999-999999999999', 'f2222222-2222-4222-8222-222222222222', 'Beto', 'Member', 'Active');
insert into public.projects (id, owner_id, workspace_id, title, status)
values ('f1aa0000-0000-4000-8000-000000000002', 'f1111111-1111-4111-8111-111111111111', 'f1999999-9999-4999-8999-999999999999', 'Mudanza', 'Active');
insert into public.tasks (id, project_id, title, status) values
  ('f1bb0000-0000-4000-8000-000000000001', 'f1aa0000-0000-4000-8000-000000000002', 'Pagar la factura de luz',  'Pending'),
  ('f1bb0000-0000-4000-8000-000000000002', 'f1aa0000-0000-4000-8000-000000000002', 'Pagar la factura de luz.', 'Pending'),
  ('f1bb0000-0000-4000-8000-000000000003', 'f1aa0000-0000-4000-8000-000000000002', 'Pagar la factura de luz!', 'Completed');

create temp table det_ana as select * from public.graph_detectar_de('f1111111-1111-4111-8111-111111111111');

select ok(
  not has_function_privilege('authenticated', 'public.graph_detectar_de(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.graph_detectar_de(uuid)', 'execute'),
  'graph_detectar_de solo la ejecuta el servidor'
);
select is(
  (select count(*)::int from det_ana
    where patron = 'sin_meta' and source_entity_id = 'f1ee0000-0000-4000-8000-000000000001'
      and target_entity_id = 'f1cc0000-0000-4000-8000-000000000001'),
  1, 'El hábito suelto aparece como candidato a apoyar la meta activa'
);
select is(
  (select count(*)::int from det_ana
    where patron = 'sin_meta' and source_entity_id = 'f1aa0000-0000-4000-8000-000000000001'),
  1, 'El proyecto del espacio personal también'
);
select is(
  (select count(*)::int from det_ana where target_entity_id = 'f1cc0000-0000-4000-8000-000000000002'),
  0, 'Una meta abandonada no se ofrece como destino'
);
select is(
  (select count(*)::int from det_ana where patron = 'posible_duplicado'),
  1, 'Las dos tareas abiertas casi iguales son UN posible duplicado; la cerrada no entra'
);

-- Con un resultado clave, el hábito deja de estar suelto.
insert into public.key_results (goal_id, title, source_kind, source_id)
values ('f1cc0000-0000-4000-8000-000000000001', 'Días de práctica', 'habit', 'f1ee0000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from public.graph_detectar_de('f1111111-1111-4111-8111-111111111111')
    where source_entity_id = 'f1ee0000-0000-4000-8000-000000000001'),
  0, 'Un hábito que ya apoya una meta no se vuelve a proponer'
);

-- Una arista duplicates ya puesta apaga la sugerencia.
insert into public.graph_edges (source_id, rel_type, target_id, origin, created_by)
values ((select id from public.graph_nodes where entity_id = 'f1bb0000-0000-4000-8000-000000000001'),
        'duplicates',
        (select id from public.graph_nodes where entity_id = 'f1bb0000-0000-4000-8000-000000000002'),
        'user', 'f1111111-1111-4111-8111-111111111111');
select is(
  (select count(*)::int from public.graph_detectar_de('f1111111-1111-4111-8111-111111111111')
    where patron = 'posible_duplicado'),
  0, 'Si ya están marcadas como duplicadas, no se sugiere otra vez'
);

select is(
  (select count(*)::int from public.graph_detectar_de('f2222222-2222-4222-8222-222222222222')
    where patron = 'sin_meta'),
  0, 'Beto comparte espacio con Ana y no recibe ni sus hábitos ni sus metas'
);
select is(
  (select count(*)::int from public.graph_detectar_de('f4444444-4444-4444-8444-444444444444')),
  0, 'Una extraña no recibe nada'
);

select * from finish();
rollback;
