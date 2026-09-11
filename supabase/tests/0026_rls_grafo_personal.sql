-- 0026_rls_grafo_personal.sql — pgTAP: la frontera redefinida (migración 0055).
--
-- POR QUÉ EXISTE
-- La 0054 prohibía toda arista entre un nodo privado y uno de un espacio de
-- trabajo. La 0055 afina la regla: se pueden unir si los ve EXACTAMENTE la
-- misma persona, y el espacio personal cumple eso porque no admite a nadie más.
--
-- Esta suite tiene que demostrar las DOS mitades, porque una sin la otra es
-- inútil: que lo nuevo se permite, y que lo viejo sigue prohibido. Y una
-- tercera que es la que de verdad me preocupa: que sacar un proyecto del
-- espacio personal no deje detrás una arista que ya no debería existir.
--
-- La prueba de que el espacio COMPARTIDO sigue cerrado vive en 0025 y no se
-- toca: allí el espacio es `is_personal = false` y la arista sigue lanzando.

begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email) values
  ('b1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grafo-personal@test.local'),
  ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grafo-vecino@test.local')
on conflict (id) do nothing;

-- El trigger handle_new_user (0030) ya le creó a cada una su espacio personal.
-- Se usa ESE y no uno inventado: la regla nueva se apoya en `is_personal`, y
-- probarla sobre un espacio marcado a mano no probaría nada del sistema real.

-- Lo privado de la dueña.
insert into public.routines (id, user_id, name)
values ('bbbb0000-0000-4000-8000-000000000001', 'b1111111-1111-4111-8111-111111111111', 'Rutina de la mañana')
on conflict (id) do nothing;
insert into public.personal_goals (id, user_id, title, area, status)
values ('bbbb0000-0000-4000-8000-000000000002', 'b1111111-1111-4111-8111-111111111111', 'Abrir la cafetería', 'Carrera', 'Activa')
on conflict (id) do nothing;

-- Un proyecto DENTRO de su espacio personal.
insert into public.projects (id, owner_id, workspace_id, title, status)
select 'bbbb0000-0000-4000-8000-000000000003', 'b1111111-1111-4111-8111-111111111111', w.id, 'Café mío', 'Active'
from public.workspaces w
where w.owner_id = 'b1111111-1111-4111-8111-111111111111' and w.is_personal
on conflict (id) do nothing;

-- Y otro en un espacio COMPARTIDO.
insert into public.workspaces (id, owner_id, name, is_personal)
values ('bbbb9999-9999-4999-8999-999999999999', 'b1111111-1111-4111-8111-111111111111', 'Equipo Café', false)
on conflict (id) do nothing;
insert into public.projects (id, owner_id, workspace_id, title, status)
values ('bbbb0000-0000-4000-8000-000000000004', 'b1111111-1111-4111-8111-111111111111', 'bbbb9999-9999-4999-8999-999999999999', 'Café del equipo', 'Active')
on conflict (id) do nothing;


-- ===========================================================================
-- 1) LO NUEVO: dentro del espacio personal, lo de uno se une con lo del otro
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ insert into public.graph_edges (source_id, rel_type, target_id, created_by)
     select (select id from public.graph_nodes where entity_id = 'bbbb0000-0000-4000-8000-000000000003'),
            'supports',
            (select id from public.graph_nodes where entity_id = 'bbbb0000-0000-4000-8000-000000000002'),
            'b1111111-1111-4111-8111-111111111111' $$,
  'Un proyecto de MI espacio personal sí puede alimentar una meta personal mía'
);

-- La arista mixta lleva las DOS columnas: la mitad de la información está en
-- cada extremo, y quedarse solo con las del origen dejaría la otra en null.
select is(
  (select (user_id is not null and workspace_id is not null) from public.graph_edges
    where target_id = (select id from public.graph_nodes where entity_id = 'bbbb0000-0000-4000-8000-000000000002')),
  true,
  'La arista mixta guarda a la vez el usuario y el espacio personal'
);


-- ===========================================================================
-- 2) LO VIEJO SIGUE EN PIE: un espacio compartido no se toca desde fuera
-- ===========================================================================
select throws_ok(
  $$ insert into public.graph_edges (source_id, rel_type, target_id, created_by)
     select (select id from public.graph_nodes where entity_id = 'bbbb0000-0000-4000-8000-000000000004'),
            'supports',
            (select id from public.graph_nodes where entity_id = 'bbbb0000-0000-4000-8000-000000000002'),
            'b1111111-1111-4111-8111-111111111111' $$,
  'P0001',
  null,
  'Un proyecto de un espacio COMPARTIDO no se puede unir con una meta personal, ni siendo dueño de los dos'
);

reset role;

-- Y tampoco al revés: el espacio personal de OTRA persona no sirve de puente.
--
-- ESTA SE EJECUTA SIN `set role`, A PROPÓSITO. Con la sesión de la dueña, la
-- RLS le esconde el nodo del espacio ajeno y el insert muere antes de llegar al
-- trigger, con un error de columna nula: pasaría la prueba sin demostrar nada
-- sobre la regla. Lo que hay que comprobar es que el TRIGGER también lo rechaza
-- cuando la RLS no está de por medio, porque `service_role` escribe así —el
-- despachador de avisos y el futuro agente de IA usan esa llave—.
select throws_ok(
  $$ insert into public.graph_edges (source_id, rel_type, target_id, created_by)
     select (select id from public.graph_nodes where entity_id = 'bbbb0000-0000-4000-8000-000000000003'),
            'related_to',
            (select n.id from public.graph_nodes n join public.workspaces w on w.id = n.entity_id
              where n.node_type = 'workspace' and w.owner_id = 'b2222222-2222-4222-8222-222222222222' and w.is_personal),
            'b1111111-1111-4111-8111-111111111111' $$,
  'P0001',
  null,
  'El espacio personal de OTRA persona no es «mi misma audiencia»: el trigger lo rechaza aunque la RLS no esté de por medio'
);




-- ===========================================================================
-- 3) EL AGUJERO: sacar el proyecto del espacio personal
--
-- Es la prueba que justifica la migración entera. Sin este borrado, abrir la
-- frontera dentro del espacio personal habría sido peor que dejarla cerrada:
-- bastaría mover un proyecto para que una arista legal pasara a cruzar de
-- verdad, sin que nadie la hubiera tocado.
-- ===========================================================================
update public.projects
   set workspace_id = 'bbbb9999-9999-4999-8999-999999999999'
 where id = 'bbbb0000-0000-4000-8000-000000000003';

select is_empty(
  $$ select 1 from public.graph_edges e
     where e.target_id = (select id from public.graph_nodes where entity_id = 'bbbb0000-0000-4000-8000-000000000002')
       and e.source_id = (select id from public.graph_nodes where entity_id = 'bbbb0000-0000-4000-8000-000000000003') $$,
  'Al mudar el proyecto a un espacio compartido, la arista con la meta personal DESAPARECE'
);

select is_empty(
  $$ select 1 from public.graph_check_integrity() $$,
  'Y no queda ninguna arista incoherente detrás'
);

-- La desaparición no puede ser un misterio: si mañana alguien pregunta dónde
-- se fue su línea, la respuesta tiene que estar escrita en alguna parte.
select isnt_empty(
  $$ select 1 from public.audit_log where action = 'graph.edges.dropped_on_move' $$,
  'Queda rastro en audit_log de las aristas que se llevó la mudanza'
);

select * from finish();
rollback;
