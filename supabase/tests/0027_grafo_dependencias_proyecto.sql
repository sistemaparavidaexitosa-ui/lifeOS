-- 0027_grafo_dependencias_proyecto.sql — pgTAP: dependencias entre proyectos y
-- vistas sin raíz (migración 0056).
--
-- POR QUÉ EXISTE
-- `projects.dependencies` llevaba en la base desde 0003 siendo TEXTO LIBRE, así
-- que «¿qué proyectos bloquea este?» era incontestable y el grafo no podía
-- dibujar una relación que solo vivía como prosa. `depends_on` la convierte en
-- dato; esta suite comprueba que además llega al grafo.
--
-- Y `graph_all` es la TERCERA función que camina con `row_security = off`. Cada
-- una de ellas necesita su propia prueba de que no filtra: la RLS no las
-- protege, las protegen las comprobaciones de dentro.

begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email) values
  ('c1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deps-duena@test.local'),
  ('c2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deps-otra@test.local')
on conflict (id) do nothing;

insert into public.workspaces (id, owner_id, name, is_personal)
values ('c9999999-9999-4999-8999-999999999999', 'c1111111-1111-4111-8111-111111111111', 'Equipo Deps', false)
on conflict (id) do nothing;

insert into public.projects (id, owner_id, workspace_id, title, status) values
  ('cccc0000-0000-4000-8000-000000000001', 'c1111111-1111-4111-8111-111111111111', 'c9999999-9999-4999-8999-999999999999', 'Obra del local', 'Active'),
  ('cccc0000-0000-4000-8000-000000000002', 'c1111111-1111-4111-8111-111111111111', 'c9999999-9999-4999-8999-999999999999', 'Apertura', 'Active')
on conflict (id) do nothing;

-- Lo privado de cada una, para la prueba de `graph_all`.
insert into public.personal_goals (id, user_id, title, area, status) values
  ('cccc0000-0000-4000-8000-000000000011', 'c1111111-1111-4111-8111-111111111111', 'Meta de la dueña', 'Carrera', 'Activa'),
  ('cccc0000-0000-4000-8000-000000000012', 'c2222222-2222-4222-8222-222222222222', 'Meta de la otra',  'Salud',   'Activa')
on conflict (id) do nothing;


-- ===========================================================================
-- 1) LA DEPENDENCIA LLEGA AL GRAFO
-- ===========================================================================
update public.projects
   set depends_on = array['cccc0000-0000-4000-8000-000000000001'::uuid]
 where id = 'cccc0000-0000-4000-8000-000000000002';

select is(
  (select count(*)::int from public.graph_edges e
    join public.graph_nodes s on s.id = e.source_id
    join public.graph_nodes t on t.id = e.target_id
   where s.entity_id = 'cccc0000-0000-4000-8000-000000000002'
     and t.entity_id = 'cccc0000-0000-4000-8000-000000000001'
     and e.rel_type = 'depends_on' and e.origin = 'system'),
  1,
  'Poner una dependencia entre proyectos la dibuja en el grafo'
);

-- Quitarla la borra: una arista `system` aparece y desaparece con el dato que
-- la causa, no se queda de recuerdo.
update public.projects set depends_on = '{}' where id = 'cccc0000-0000-4000-8000-000000000002';

select is(
  (select count(*)::int from public.graph_edges e
    join public.graph_nodes s on s.id = e.source_id
   where s.entity_id = 'cccc0000-0000-4000-8000-000000000002' and e.rel_type = 'depends_on'),
  0,
  'Y quitarla la borra del grafo'
);

-- ===========================================================================
-- 2) LO QUE LA BASE PUEDE IMPEDIR SOLA
-- ===========================================================================
select throws_ok(
  $$ update public.projects
        set depends_on = array['cccc0000-0000-4000-8000-000000000001'::uuid]
      where id = 'cccc0000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'Un proyecto no puede depender de sí mismo: se bloquearía para siempre'
);

-- Los ciclos de dos o más saltos NO los ataja la base —haría falta un recorrido
-- en cada UPDATE—, los ataja la Server Action antes de escribir. Se comprueba
-- que al menos el grafo los SOPORTA sin colgarse, que es la otra mitad.
update public.projects set depends_on = array['cccc0000-0000-4000-8000-000000000002'::uuid]
 where id = 'cccc0000-0000-4000-8000-000000000001';
update public.projects set depends_on = array['cccc0000-0000-4000-8000-000000000001'::uuid]
 where id = 'cccc0000-0000-4000-8000-000000000002';

select is(
  (select count(*)::int from public.graph_edges where rel_type = 'depends_on' and origin = 'system'
    and source_id in (select id from public.graph_nodes where entity_id in
      ('cccc0000-0000-4000-8000-000000000001','cccc0000-0000-4000-8000-000000000002'))),
  2,
  'Un ciclo metido a mano en la base se PROYECTA en vez de rechazarse: el grafo refleja la realidad aunque sea fea (D-121)'
);


-- ===========================================================================
-- 3) `graph_all` NO FILTRA — es la tercera función con la RLS apagada
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from public.graph_all(array['goal'], 'user', 500)
    where entity_id = 'cccc0000-0000-4000-8000-000000000011'),
  1,
  'graph_all trae TUS metas sin necesidad de recorrer desde ninguna raíz'
);

select is_empty(
  $$ select 1 from public.graph_all(array['goal'], 'user', 500)
     where entity_id = 'cccc0000-0000-4000-8000-000000000012' $$,
  'Y no trae la meta de otra persona, aunque camine con row_security apagada'
);

select is_empty(
  $$ select 1 from public.graph_all(array['project'], 'workspace', 500)
     where entity_id in (select id from public.projects
                          where workspace_id <> 'c9999999-9999-4999-8999-999999999999') $$,
  'Ni proyectos de espacios de los que no eres miembro'
);

reset role;

-- ===========================================================================
-- 4) LA FORMA DE LA FUNCIÓN ES PARTE DEL CONTRATO
-- ===========================================================================
select is(
  has_function_privilege('anon', 'public.graph_all(text[],text,integer)', 'execute'),
  false,
  'anon no puede llamar a graph_all: el default de 0010 se revoca explícitamente'
);

select is(
  (select p.provolatile::text from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'graph_all'),
  's',
  'graph_all es `stable`: una función stable no puede escribir, y esta camina con la RLS apagada'
);

select * from finish();
rollback;
