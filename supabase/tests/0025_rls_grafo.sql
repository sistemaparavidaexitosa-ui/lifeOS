-- 0025_rls_grafo.sql — pgTAP: el Execution Graph (migración 0054).
--
-- POR QUÉ EXISTE, Y POR QUÉ ES LA SUITE MÁS IMPORTANTE DEL REPO HASTA AHORA
--
-- Dos cosas nuevas pasan en 0054 y las dos quitan una red que hasta hoy siempre
-- había estado puesta:
--
--   1. `graph_nodes` es la PRIMERA tabla donde una fila que describe un
--      presupuesto y una fila que describe un proyecto compartido conviven bajo
--      la misma política. docs/SECURITY.md declara como control que «ninguna
--      tabla de Money OS, Hogar, Time o Habits tiene workspace_id», y a partir
--      de aquí ese control ya no se puede invocar.
--
--   2. `graph_impact` y `graph_subgraph` son las primeras funciones del sistema
--      que caminan por filas con `row_security = off`. La RLS NO las protege:
--      las protege un `if` de doce líneas escrito a mano. Estas pruebas SON ese
--      `if`.
--
-- El caso del Guest tiene una prueba propia porque estuvo a punto de ser un
-- agujero de verdad: un Guest ES miembro activo del espacio, así que
-- `is_workspace_member()` le dice que sí a todo, y lo único que le limita a sus
-- proyectos compartidos es `has_project_access()` —justo lo que el precálculo
-- de las funciones de recorrido elimina para no llamarlo por fila—.
--
-- Se inserta suplantando al usuario donde se prueba una política; el fixture se
-- siembra antes de `set local role`, como en 0018.

begin;
select plan(14);

-- ---------------------------------------------------------------------------
-- FIXTURE
-- Cuatro personas: la dueña del espacio, un miembro de pleno derecho, una
-- invitada con acceso a UN solo proyecto, y alguien de fuera.
-- El trigger handle_new_user (0030) le crea a cada una su perfil y su espacio
-- personal, y desde 0054 también sus nodos.
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grafo-duena@test.local'),
  ('a2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grafo-miembro@test.local'),
  ('a3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grafo-invitada@test.local'),
  ('a4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grafo-fuera@test.local')
on conflict (id) do nothing;

insert into public.workspaces (id, owner_id, name, is_personal)
values ('a9999999-9999-4999-8999-999999999999', 'a1111111-1111-4111-8111-111111111111', 'Equipo Grafo', false)
on conflict (id) do nothing;

insert into public.memberships (workspace_id, user_id, user_name, role, status) values
  ('a9999999-9999-4999-8999-999999999999', 'a2222222-2222-4222-8222-222222222222', 'Grafo Miembro',  'Member', 'Active'),
  ('a9999999-9999-4999-8999-999999999999', 'a3333333-3333-4333-8333-333333333333', 'Grafo Invitada', 'Guest',  'Active')
on conflict (workspace_id, user_id) do nothing;

-- Dos proyectos en el MISMO espacio. La invitada solo tiene compartido el primero.
insert into public.projects (id, owner_id, workspace_id, title, status) values
  ('aaaa1111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'a9999999-9999-4999-8999-999999999999', 'Proyecto compartido con la invitada', 'Active'),
  ('aaaa2222-2222-4222-8222-222222222222', 'a1111111-1111-4111-8111-111111111111', 'a9999999-9999-4999-8999-999999999999', 'Proyecto del que la invitada no sabe nada', 'Active')
on conflict (id) do nothing;

insert into public.project_shares (project_id, workspace_id, access_level)
values ('aaaa1111-1111-4111-8111-111111111111', 'a9999999-9999-4999-8999-999999999999', 'view')
on conflict (project_id) do nothing;

insert into public.tasks (id, project_id, title, status) values
  ('bbbb1111-1111-4111-8111-111111111111', 'aaaa1111-1111-4111-8111-111111111111', 'Tarea que la invitada sí ve', 'Pending'),
  ('bbbb2222-2222-4222-8222-222222222222', 'aaaa1111-1111-4111-8111-111111111111', 'Otra tarea del proyecto compartido', 'Pending'),
  ('bbbb3333-3333-4333-8333-333333333333', 'aaaa2222-2222-4222-8222-222222222222', 'Tarea del proyecto reservado', 'Pending')
on conflict (id) do nothing;

-- Lo privado de la dueña: una rutina con un hábito. Vive en la misma tabla de
-- nodos que las tareas de arriba, y ese es exactamente el riesgo nuevo.
insert into public.routines (id, user_id, name) values
  ('cccc1111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'Rutina de la mañana')
on conflict (id) do nothing;
insert into public.habits (id, user_id, routine_id, name) values
  ('cccc2222-2222-4222-8222-222222222222', 'a1111111-1111-4111-8111-111111111111', 'cccc1111-1111-4111-8111-111111111111', 'Meditar diez minutos')
on conflict (id) do nothing;


-- ===========================================================================
-- 1) LA PROYECCIÓN EXISTE Y TIENE LA FORMA QUE DICE TENER
-- ===========================================================================
select is(
  (select count(*)::int from public.graph_nodes where entity_id = 'bbbb1111-1111-4111-8111-111111111111'),
  1,
  'Crear una tarea crea su nodo: la proyección es un trigger, no un trabajo nocturno'
);

select is(
  (select n.scope from public.graph_nodes n where n.entity_id = 'cccc2222-2222-4222-8222-222222222222'),
  'user',
  'Un hábito se proyecta como nodo PRIVADO aunque comparta tabla con las tareas de un espacio'
);

-- La arista que ya existía como dato: el hábito cuelga de su rutina.
select is(
  (select count(*)::int from public.graph_edges e
    join public.graph_nodes s on s.id = e.source_id
    join public.graph_nodes t on t.id = e.target_id
   where s.entity_id = 'cccc2222-2222-4222-8222-222222222222'
     and t.entity_id = 'cccc1111-1111-4111-8111-111111111111'
     and e.rel_type = 'belongs_to' and e.origin = 'system'),
  1,
  'Las relaciones que ya vivían en el dominio (habits.routine_id) nacen dibujadas'
);


-- ===========================================================================
-- 2) BR-012: LA FRONTERA NO SE PUEDE CRUZAR NI QUERIENDO
-- ===========================================================================
select throws_ok(
  $$ insert into public.graph_edges (source_id, rel_type, target_id, created_by)
     select (select id from public.graph_nodes where entity_id = 'cccc2222-2222-4222-8222-222222222222'),
            'related_to',
            (select id from public.graph_nodes where entity_id = 'bbbb1111-1111-4111-8111-111111111111'),
            'a1111111-1111-4111-8111-111111111111' $$,
  'P0001',
  null,
  'Un hábito privado no se puede relacionar con una tarea de un espacio, ni siendo dueña de las dos'
);

-- El errcode importa tanto como el rechazo: 23514 o 42501 harían que
-- describeDbError() sustituyera el mensaje por un genérico, y el genérico no
-- explica nada. Ver src/lib/supabase/errors.ts y el comentario de 0054 §7.
select throws_ok(
  $$ insert into public.graph_nodes (scope, user_id, workspace_id, node_type, label)
     values ('user', 'a1111111-1111-4111-8111-111111111111', 'a9999999-9999-4999-8999-999999999999', 'custom', 'Nodo anfibio') $$,
  '23514',
  null,
  'No existe la fila anfibia: un nodo o es privado o es de un espacio, nunca las dos cosas'
);


-- ===========================================================================
-- 3) EL GUEST — la prueba que este módulo existe para no fallar
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from public.graph_impact(
     (select id from public.graph_nodes where entity_id = 'aaaa1111-1111-4111-8111-111111111111'),
     'downstream', 3, 100)
   where entity_table = 'tasks'),
  2,
  'La invitada ve las dos tareas del proyecto que SÍ tiene compartido'
);

select throws_ok(
  $$ select * from public.graph_impact(
       (select id from public.graph_nodes where entity_id = 'aaaa2222-2222-4222-8222-222222222222')) $$,
  '42501',
  null,
  'La invitada no arranca un recorrido en el proyecto que no tiene compartido: la raíz se comprueba antes de caminar'
);

-- El caso que motiva los DOS conjuntos de permiso: los dos proyectos están en
-- el mismo espacio, así que is_workspace_member() le dice que sí a la invitada.
-- Si el precálculo se hubiera hecho por espacio, aquí saldría el espacio entero.
select is_empty(
  $$ select 1 from public.graph_impact(
       (select id from public.graph_nodes where entity_id = 'aaaa1111-1111-4111-8111-111111111111'),
       'downstream', 5, 500) gi
     join public.graph_nodes n on n.id = gi.node_id
     where n.project_id is not null
       and n.project_id <> 'aaaa1111-1111-4111-8111-111111111111' $$,
  'El recorrido de la invitada NO cruza al otro proyecto del mismo espacio (0031: Guest se resuelve por project_shares, no por membresía)'
);


-- ===========================================================================
-- 4) UN COMPAÑERO DE ESPACIO NO VE LO PRIVADO DE NADIE
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.graph_impact(
       (select id from public.graph_nodes where entity_table = 'workspaces'
          and entity_id = 'a9999999-9999-4999-8999-999999999999'),
       'downstream', 6, 1000)
     where entity_table in ('habits', 'routines', 'budgets', 'investments', 'assets', 'books', 'personal_goals', 'logbook') $$,
  'Ningún nodo privado entra en el recorrido de un compañero de espacio (BR-012/BR-027)'
);

select is_empty(
  $$ select 1 from public.graph_nodes where entity_id = 'cccc2222-2222-4222-8222-222222222222' $$,
  'Y por RLS directa tampoco: el hábito de otra persona no existe para ti'
);

reset role;


-- ===========================================================================
-- 5) LA FORMA DE LAS FUNCIONES DE RECORRIDO ES PARTE DEL CONTRATO
--
-- Estas dos son las que más valen a un año vista. No prueban un comportamiento:
-- prueban que nadie ha «arreglado» la función quitándole los `set`, que es como
-- se rompen las cosas que caminan con la seguridad apagada.
-- ===========================================================================
select is(
  (select p.proconfig::text from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'graph_impact'),
  '{search_path=public,row_security=off,statement_timeout=5s}',
  'graph_impact conserva sus tres `set`: sin search_path fijo, pg_temp la secuestra'
);

select is(
  (select p.provolatile::text from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'graph_impact'),
  's',
  'graph_impact sigue siendo `stable`: una función stable no puede escribir, y esta camina con row_security apagada'
);

-- 0010_default_privileges.sql concede EXECUTE a `anon` sobre toda función nueva
-- de este esquema. Que aquí salga false significa que la migración lo revocó a
-- mano; si alguien añade una función de recorrido y olvida el revoke, esto no
-- lo detecta — pero al menos deja escrito que el revoke es obligatorio.
select is(
  has_function_privilege('anon', 'public.graph_impact(uuid,text,integer,integer)', 'execute'),
  false,
  'anon no puede llamar a graph_impact: el default de 0010 se revoca explícitamente'
);


-- ===========================================================================
-- 6) MUDAR UN PROYECTO NO DEJA EL GRAFO MINTIENDO
-- ===========================================================================
insert into public.workspaces (id, owner_id, name, is_personal)
values ('a8888888-8888-4888-8888-888888888888', 'a1111111-1111-4111-8111-111111111111', 'Otro equipo', false)
on conflict (id) do nothing;

update public.projects
   set workspace_id = 'a8888888-8888-4888-8888-888888888888'
 where id = 'aaaa1111-1111-4111-8111-111111111111';

select is_empty(
  $$ select 1 from public.graph_check_integrity() $$,
  'Tras mover un proyecto de espacio, ninguna arista queda apuntando al espacio anterior'
);

select * from finish();
rollback;
