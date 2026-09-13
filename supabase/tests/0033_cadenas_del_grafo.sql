-- 0033_cadenas_del_grafo.sql — pgTAP: el recorrido «a qué pertenece y qué apoya» (0062).
--
-- POR QUÉ EXISTE
-- `graph_cadenas_de` camina con `row_security = off` y recibe el usuario como
-- argumento, porque el coach corre sin sesión. Una función así solo es segura
-- si NADIE salvo el servidor la puede llamar, y si el filtro de cada salto es
-- el mismo `graph_nodo_visible` de siempre. Esta suite vigila las dos cosas, y
-- que las versiones sin argumento sigan contestando lo mismo que antes.

begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email) values
  ('d1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cad-duena@test.local'),
  ('d2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cad-miembro@test.local'),
  ('d3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cad-invitada@test.local'),
  ('d4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cad-extrana@test.local')
on conflict (id) do nothing;

-- Lo personal de la dueña: espacio personal (lo creó handle_new_user), un
-- proyecto dentro, una tarea, una meta, una rutina con un hábito.
insert into public.projects (id, owner_id, workspace_id, title, status)
select 'd1aa0000-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111', w.id, 'Abrir la tienda', 'Active'
from public.workspaces w
where w.owner_id = 'd1111111-1111-4111-8111-111111111111' and w.is_personal;

insert into public.tasks (id, project_id, title, status)
values ('d1bb0000-0000-4000-8000-000000000001', 'd1aa0000-0000-4000-8000-000000000001', 'Firmar el local', 'Pending');

insert into public.personal_goals (id, user_id, title, area, status)
values ('d1cc0000-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'Ser independiente', 'Carrera', 'Activa');

insert into public.routines (id, user_id, name)
values ('d1dd0000-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'Mañanas');
insert into public.habits (id, user_id, name, routine_id)
values ('d1ee0000-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'Escribir el plan', 'd1dd0000-0000-4000-8000-000000000001');

-- El hábito apoya la meta por un resultado clave (arista `system`)…
insert into public.key_results (goal_id, title, source_kind, source_id)
values ('d1cc0000-0000-4000-8000-000000000001', 'Días escribiendo', 'habit', 'd1ee0000-0000-4000-8000-000000000001');

-- …y el proyecto la apoya por una arista que dibujó la dueña.
insert into public.graph_edges (source_id, rel_type, target_id, origin, created_by)
values (
  (select id from public.graph_nodes where entity_id = 'd1aa0000-0000-4000-8000-000000000001'),
  'supports',
  (select id from public.graph_nodes where entity_id = 'd1cc0000-0000-4000-8000-000000000001'),
  'user', 'd1111111-1111-4111-8111-111111111111'
);

-- Un espacio compartido con miembro e invitada, y un proyecto que la invitada NO tiene.
insert into public.workspaces (id, owner_id, name, is_personal)
values ('d1999999-9999-4999-8999-999999999999', 'd1111111-1111-4111-8111-111111111111', 'Equipo tienda', false);
insert into public.memberships (workspace_id, user_id, user_name, role, status) values
  ('d1999999-9999-4999-8999-999999999999', 'd1111111-1111-4111-8111-111111111111', 'Dueña',    'Owner',  'Active'),
  ('d1999999-9999-4999-8999-999999999999', 'd2222222-2222-4222-8222-222222222222', 'Miembro',  'Member', 'Active'),
  ('d1999999-9999-4999-8999-999999999999', 'd3333333-3333-4333-8333-333333333333', 'Invitada', 'Guest',  'Active');
insert into public.projects (id, owner_id, workspace_id, title, status)
values ('d1aa0000-0000-4000-8000-000000000002', 'd1111111-1111-4111-8111-111111111111', 'd1999999-9999-4999-8999-999999999999', 'Reservado', 'Active');
insert into public.tasks (id, project_id, title, status)
values ('d1bb0000-0000-4000-8000-000000000002', 'd1aa0000-0000-4000-8000-000000000002', 'Tarea reservada', 'Pending');

create or replace function pg_temp.como(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true)::void;
$$;

-- ===========================================================================
-- 1-4) Quién puede llamar a qué
-- ===========================================================================
select ok(
  not has_function_privilege('authenticated', 'public.graph_acceso_espacios_de(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.graph_acceso_proyectos_de(uuid)', 'execute'),
  'Las variantes por uid del precómputo no las llama nadie desde fuera'
);
select ok(
  not has_function_privilege('authenticated', 'public.graph_cadenas_de(uuid, uuid[], integer)', 'execute')
  and not has_function_privilege('anon', 'public.graph_cadenas_de(uuid, uuid[], integer)', 'execute'),
  'graph_cadenas_de no es ejecutable por authenticated ni anon: recibe el usuario como argumento'
);
select ok(
  has_function_privilege('service_role', 'public.graph_cadenas_de(uuid, uuid[], integer)', 'execute'),
  'graph_cadenas_de sí la ejecuta el servidor (el coach, sin sesión)'
);
select ok(
  has_function_privilege('authenticated', 'public.graph_cadenas(uuid[], integer)', 'execute')
  and not has_function_privilege('anon', 'public.graph_cadenas(uuid[], integer)', 'execute'),
  'graph_cadenas es para una sesión, no para anon'
);

-- ===========================================================================
-- 5-6) Las versiones sin argumento contestan lo mismo que antes
-- ===========================================================================
select pg_temp.como('d2222222-2222-4222-8222-222222222222');
select ok(
  public.graph_acceso_espacios() = public.graph_acceso_espacios_de('d2222222-2222-4222-8222-222222222222')
  and 'd1999999-9999-4999-8999-999999999999' = any (public.graph_acceso_espacios()),
  'graph_acceso_espacios() delega en la variante por uid y el miembro sigue viendo su espacio'
);
select pg_temp.como('d3333333-3333-4333-8333-333333333333');
select ok(
  not ('d1999999-9999-4999-8999-999999999999' = any (public.graph_acceso_espacios()))
  and public.graph_acceso_proyectos() = public.graph_acceso_proyectos_de('d3333333-3333-4333-8333-333333333333'),
  'La invitada sigue sin el espacio entero, y su precómputo por uid coincide'
);

-- ===========================================================================
-- 7-10) Las cadenas de la dueña
-- ===========================================================================
select pg_temp.como('d1111111-1111-4111-8111-111111111111');

select is(
  (select depth from public.graph_cadenas(array['d1bb0000-0000-4000-8000-000000000001'::uuid])
    where node_type = 'goal'),
  2,
  'Tarea → proyecto → meta: la meta aparece a profundidad 2'
);
select is(
  (select via_rel from public.graph_cadenas(array['d1ee0000-0000-4000-8000-000000000001'::uuid])
    where node_type = 'goal'),
  'supports',
  'El hábito llega a la meta por supports, a profundidad 1'
);
select is(
  (select count(*)::int from public.graph_cadenas(array['d1bb0000-0000-4000-8000-000000000001'::uuid])
    where node_type in ('workspace', 'person')),
  0,
  'Una cadena nunca sube al espacio ni a una persona: no dicen nada de para qué sirve algo'
);
select is(
  (select count(*)::int from public.graph_cadenas(array['d1bb0000-0000-4000-8000-000000000001'::uuid])),
  (select count(*)::int from public.graph_cadenas_de('d1111111-1111-4111-8111-111111111111',
                                                     array['d1bb0000-0000-4000-8000-000000000001'::uuid])),
  'La versión de sesión y la del servidor devuelven lo mismo para la misma persona'
);

-- ===========================================================================
-- 11-13) Lo que no se alcanza
-- ===========================================================================
select pg_temp.como('d3333333-3333-4333-8333-333333333333');
select is(
  (select count(*)::int from public.graph_cadenas(array['d1bb0000-0000-4000-8000-000000000002'::uuid])),
  0,
  'La invitada no recorre desde una tarea de un proyecto que no le compartieron'
);
select is(
  (select count(*)::int from public.graph_cadenas_de('d4444444-4444-4444-8444-444444444444',
                                                     array['d1bb0000-0000-4000-8000-000000000001'::uuid,
                                                           'd1ee0000-0000-4000-8000-000000000001'::uuid])),
  0,
  'Una extraña no alcanza nada de la dueña, ni lo personal ni lo de su espacio personal'
);
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select * from public.graph_cadenas(array['d1bb0000-0000-4000-8000-000000000001'::uuid]) $$,
  '42501', null,
  'Sin sesión, graph_cadenas se niega'
);

select * from finish();
rollback;
