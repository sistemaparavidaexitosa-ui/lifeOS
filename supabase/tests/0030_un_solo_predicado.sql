-- 0030_un_solo_predicado.sql — pgTAP: el predicado de permiso unificado (0059).
--
-- POR QUÉ EXISTE
-- 0059 sustituye por una llamada las siete copias de la condición que decide
-- quién ve qué nodo, dentro de cuatro funciones que caminan con
-- `row_security = off`. La RLS no las protege: las protege esa condición. Un
-- refactor ahí no se puede dar por bueno porque compile.
--
-- Las pruebas de `0025_rls_grafo.sql` ya cubren la frontera de la invitada a
-- través de `graph_impact`. Esta suite la cubre a través de las CUATRO, que es
-- lo que 0059 toca, y comprueba además las dos propiedades de las que depende
-- que el cambio no cueste rendimiento.

begin;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email) values
  ('c5111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pred-duena@test.local'),
  ('c5222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pred-miembro@test.local'),
  ('c5333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pred-invitada@test.local'),
  ('c5444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pred-extrana@test.local')
on conflict (id) do nothing;

insert into public.workspaces (id, owner_id, name, is_personal)
values ('c5999999-9999-4999-8999-999999999999', 'c5111111-1111-4111-8111-111111111111', 'Espacio del predicado', false);

insert into public.memberships (workspace_id, user_id, user_name, role, status) values
  ('c5999999-9999-4999-8999-999999999999', 'c5111111-1111-4111-8111-111111111111', 'Dueña',    'Owner',  'Active'),
  ('c5999999-9999-4999-8999-999999999999', 'c5222222-2222-4222-8222-222222222222', 'Miembro',  'Member', 'Active'),
  ('c5999999-9999-4999-8999-999999999999', 'c5333333-3333-4333-8333-333333333333', 'Invitada', 'Guest',  'Active');

insert into public.projects (id, owner_id, workspace_id, title, status) values
  ('c5aa0000-0000-4000-8000-000000000001', 'c5111111-1111-4111-8111-111111111111', 'c5999999-9999-4999-8999-999999999999', 'Proyecto compartido', 'Active'),
  ('c5aa0000-0000-4000-8000-000000000002', 'c5111111-1111-4111-8111-111111111111', 'c5999999-9999-4999-8999-999999999999', 'Proyecto reservado',  'Active');

insert into public.project_shares (project_id, workspace_id, access_level)
values ('c5aa0000-0000-4000-8000-000000000001', 'c5999999-9999-4999-8999-999999999999', 'edit');

insert into public.tasks (id, project_id, title, status) values
  ('c5bb0000-0000-4000-8000-000000000001', 'c5aa0000-0000-4000-8000-000000000001', 'Tarea compartida', 'Pending'),
  ('c5bb0000-0000-4000-8000-000000000002', 'c5aa0000-0000-4000-8000-000000000002', 'Tarea reservada',  'Pending');

-- Una arista que CRUZA de un proyecto al otro. Es la que hace que la prueba
-- valga: sin ella, que la invitada no llegue al otro proyecto no demostraría
-- nada, porque no habría camino.
update public.tasks set deps = array['c5bb0000-0000-4000-8000-000000000001'::uuid]
 where id = 'c5bb0000-0000-4000-8000-000000000002';

-- Y algo estrictamente privado de la dueña, para la frontera BR-012.
insert into public.routines (id, user_id, name)
values ('c5330000-0000-4000-8000-000000000001', 'c5111111-1111-4111-8111-111111111111', 'Rutina privada');
insert into public.habits (id, user_id, name, routine_id)
values ('c5440000-0000-4000-8000-000000000001', 'c5111111-1111-4111-8111-111111111111', 'Hábito privado', 'c5330000-0000-4000-8000-000000000001');

create or replace function pg_temp.como(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true)::void;
$$;


-- ===========================================================================
-- 1-2) YA NO HAY SIETE COPIAS, Y LA QUE QUEDA PUEDE EMBEBERSE
-- ===========================================================================
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('graph_impact', 'graph_subgraph', 'graph_all', 'graph_edges_of')
      and p.prosrc like '%scope = ''user'' and%user_id = v_uid%'),
  0,
  'Ninguna de las cuatro funciones de recorrido lleva ya la condición escrita dentro'
);

-- `sql` + `immutable` + sin `strict` + sin `security definer` son las cuatro
-- propiedades que permiten al planificador sustituir la llamada por su cuerpo.
-- Con `security definer` deja de embeberse y `graph_all` pierde
-- `idx_graph_nodes_ws` sin que nada falle: solo va más despacio cada mes.
select is(
  (select l.lanname || '|' || p.provolatile::text || '|' ||
          p.proisstrict::text || '|' || p.prosecdef::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     join pg_language  l on l.oid = p.prolang
    where n.nspname = 'public' and p.proname = 'graph_nodo_visible'),
  'sql|i|false|false',
  'graph_nodo_visible sigue siendo sql, immutable, no strict y no security definer: así se embebe'
);


-- ===========================================================================
-- 3) EL CONTROL, SIN EL CUAL LAS DE ABAJO NO DEMUESTRAN NADA
--
-- Las assertions de la invitada comprueban que NO alcanza la tarea del otro
-- proyecto. Eso se cumple solo, y en silencio, si resulta que no hay camino
-- hasta ella — y entonces la prueba pasa sin vigilar nada. Esta comprueba que
-- el camino existe: la dueña sí la alcanza, a dos saltos.
-- ===========================================================================
select pg_temp.como('c5111111-1111-4111-8111-111111111111');
select is(
  (select count(*)::int from public.graph_impact(
      public.graph_node_of('c5aa0000-0000-4000-8000-000000000001'), 'downstream')
    where entity_id = 'c5bb0000-0000-4000-8000-000000000002'),
  1,
  'CONTROL: la dueña sí alcanza la tarea del otro proyecto, así que hay una frontera que cortar'
);


-- ===========================================================================
-- 4-5) LOS DOS CONJUNTOS DE PERMISO SIGUEN SIENDO DOS
--
-- Un Guest es miembro ACTIVO del espacio, así que cualquier cálculo que se
-- apoye solo en `memberships` le entrega el espacio entero. Es el error que los
-- dos conjuntos existen para no cometer.
-- ===========================================================================
select pg_temp.como('c5333333-3333-4333-8333-333333333333');
select ok(
  not ('c5999999-9999-4999-8999-999999999999' = any (public.graph_acceso_espacios())),
  'El espacio NO entra en los espacios accesibles de una invitada, aunque sea miembro activo'
);
select ok(
  'c5aa0000-0000-4000-8000-000000000001' = any (public.graph_acceso_proyectos())
  and not ('c5aa0000-0000-4000-8000-000000000002' = any (public.graph_acceso_proyectos())),
  'A la invitada le llega su proyecto compartido y solo ese'
);


-- ===========================================================================
-- 6-10) LA INVITADA, A TRAVÉS DE LAS CUATRO FUNCIONES
-- ===========================================================================
select throws_ok(
  format($$ select * from public.graph_impact(%L) $$,
         public.graph_node_of('c5999999-9999-4999-8999-999999999999')),
  '42501', null,
  'graph_impact: la invitada no arranca un recorrido en el nodo del espacio'
);

select throws_ok(
  format($$ select * from public.graph_impact(%L) $$,
         public.graph_node_of('c5aa0000-0000-4000-8000-000000000002')),
  '42501', null,
  'graph_impact: ni en el proyecto que no tiene compartido'
);

select is(
  (select count(*)::int from public.graph_impact(
     public.graph_node_of('c5aa0000-0000-4000-8000-000000000001'))),
  1,
  'graph_impact: sí recorre desde su proyecto, y llega a su tarea'
);

-- La arista cruza de la tarea reservada a la compartida, así que el recorrido
-- pasa por delante del otro proyecto. Y se corta ahí.
select is_empty(
  format($$ select node_id from public.graph_impact(%L, 'downstream')
             where entity_id = 'c5bb0000-0000-4000-8000-000000000002' $$,
         public.graph_node_of('c5aa0000-0000-4000-8000-000000000001')),
  'graph_impact: el recorrido se CORTA en el nodo inaccesible, no lo atraviesa para llegar al de más allá'
);

select is(
  (select count(*)::int from public.graph_all(null, 'workspace', 500)
    where entity_id in ('c5aa0000-0000-4000-8000-000000000002',
                        'c5bb0000-0000-4000-8000-000000000002',
                        'c5999999-9999-4999-8999-999999999999')),
  0,
  'graph_all: la invitada no ve el espacio, ni el otro proyecto, ni su tarea'
);


-- ===========================================================================
-- 11-12) `graph_subgraph` y `graph_edges_of` aplican la MISMA frontera
--
-- Son las dos que menos se prueban y las que más fácil se quedan atrás en un
-- refactor, porque la pantalla las usa por debajo y no tienen mensaje de error
-- propio.
-- ===========================================================================
select is_empty(
  format($$ select node_id from public.graph_subgraph(%L, null, null, 3, 500)
             where entity_id = 'c5bb0000-0000-4000-8000-000000000002' $$,
         public.graph_node_of('c5aa0000-0000-4000-8000-000000000001')),
  'graph_subgraph: tampoco cruza a la tarea del otro proyecto'
);

select is_empty(
  $$ select e.source_id from public.graph_edges_of(
       (select array_agg(id) from public.graph_nodes)) e
      join public.graph_nodes n on n.id in (e.source_id, e.target_id)
     where n.entity_id in ('c5bb0000-0000-4000-8000-000000000002',
                           'c5aa0000-0000-4000-8000-000000000002') $$,
  'graph_edges_of: no devuelve ninguna arista que toque un nodo que la invitada no ve'
);


-- ===========================================================================
-- 13-14) BR-012: lo privado no se alcanza desde un espacio compartido
-- ===========================================================================
select pg_temp.como('c5222222-2222-4222-8222-222222222222');
select is(
  (select count(*)::int from public.graph_all(null, 'user', 500)),
  0,
  'graph_all: un compañero de espacio no ve nada del ámbito privado de otra persona'
);
select throws_ok(
  format($$ select * from public.graph_impact(%L) $$,
         public.graph_node_of('c5440000-0000-4000-8000-000000000001')),
  '42501', null,
  'graph_impact: un compañero de espacio no arranca un recorrido en el hábito de otra (BR-012)'
);


-- ===========================================================================
-- 15) LA EXTRAÑA NO ALCANZA NADA
-- ===========================================================================
select pg_temp.como('c5444444-4444-4444-8444-444444444444');
select is(
  (select count(*)::int from public.graph_all(null, 'workspace', 500)
    where entity_id in ('c5999999-9999-4999-8999-999999999999',
                        'c5aa0000-0000-4000-8000-000000000001',
                        'c5aa0000-0000-4000-8000-000000000002')),
  0,
  'Quien no es de este espacio no ve ninguno de sus nodos'
);


-- ===========================================================================
-- 16-17) PERMISOS Y GARANTÍAS QUE NO SE PUEDEN PERDER AL RECREAR UN CUERPO
-- ===========================================================================
select ok(
  not has_function_privilege('authenticated', 'public.graph_acceso_espacios()',  'execute')
  and not has_function_privilege('authenticated', 'public.graph_acceso_proyectos()', 'execute')
  and not has_function_privilege('anon', 'public.graph_impact(uuid, text, integer, integer)', 'execute'),
  'Los dos conjuntos de permiso no se conceden a una sesión de usuario, y anon sigue sin recorrer'
);

select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('graph_impact', 'graph_subgraph', 'graph_all', 'graph_edges_of')
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig @> array['row_security=off']
      and p.proconfig @> array['search_path=public']
      and p.proconfig @> array['statement_timeout=5s']),
  4,
  'Las cuatro conservan `stable`, `security definer` y sus tres `set` tras recrearse'
);

select * from finish();
rollback;
