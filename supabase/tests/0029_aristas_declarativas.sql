-- 0029_aristas_declarativas.sql — pgTAP: las aristas generadas (migración 0058).
--
-- POR QUÉ EXISTE
-- 0058 sustituye el cuerpo de siete funciones que llevaban meses funcionando por
-- uno generado a partir de `graph_edge_rules`. La migración demuestra que el
-- modelo declarativo REPRODUCE el conjunto de aristas que había, pero eso se
-- comprueba una vez, contra los datos que hubiera ese día. Esta suite comprueba
-- lo otro: que cada una de las once relaciones siga apareciendo y —lo que más
-- se rompe— siga DESAPARECIENDO cuando el dato que la causa se quita.
--
-- Una arista `system` que se queda de recuerdo no da error. Deja el mapa
-- mintiendo, y el panel de impacto contesta «esto rompe aquello» sobre una
-- dependencia que ya nadie declaró.

begin;
select plan(21);

insert into auth.users (id, instance_id, aud, role, email) values
  ('a8111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aristas-ana@test.local'),
  ('a8222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aristas-beto@test.local')
on conflict (id) do nothing;

insert into public.workspaces (id, owner_id, name, is_personal)
values ('a8999999-9999-4999-8999-999999999999', 'a8111111-1111-4111-8111-111111111111', 'Espacio Aristas', false);

insert into public.memberships (workspace_id, user_id, user_name, role, status) values
  ('a8999999-9999-4999-8999-999999999999', 'a8111111-1111-4111-8111-111111111111', 'Ana',  'Owner',  'Active'),
  ('a8999999-9999-4999-8999-999999999999', 'a8222222-2222-4222-8222-222222222222', 'Beto', 'Member', 'Active');

insert into public.projects (id, owner_id, workspace_id, title, status) values
  ('a8aa0000-0000-4000-8000-000000000001', 'a8111111-1111-4111-8111-111111111111', 'a8999999-9999-4999-8999-999999999999', 'Proyecto uno', 'Active'),
  ('a8aa0000-0000-4000-8000-000000000002', 'a8111111-1111-4111-8111-111111111111', 'a8999999-9999-4999-8999-999999999999', 'Proyecto dos', 'Active');

insert into public.tasks (id, project_id, title, status) values
  ('a8bb0000-0000-4000-8000-000000000001', 'a8aa0000-0000-4000-8000-000000000001', 'Tarea madre',   'Pending'),
  ('a8bb0000-0000-4000-8000-000000000002', 'a8aa0000-0000-4000-8000-000000000001', 'Tarea hija',    'Pending'),
  ('a8bb0000-0000-4000-8000-000000000003', 'a8aa0000-0000-4000-8000-000000000001', 'Tarea tercera', 'Pending');

insert into public.routines (id, user_id, name)
values ('a8330000-0000-4000-8000-000000000001', 'a8111111-1111-4111-8111-111111111111', 'Mañanas');
insert into public.habits (id, user_id, name, routine_id) values
  ('a8440000-0000-4000-8000-000000000001', 'a8111111-1111-4111-8111-111111111111', 'Leer',    'a8330000-0000-4000-8000-000000000001'),
  ('a8440000-0000-4000-8000-000000000002', 'a8111111-1111-4111-8111-111111111111', 'Meditar', 'a8330000-0000-4000-8000-000000000001');
insert into public.books (id, user_id, title)
values ('a8550000-0000-4000-8000-000000000001', 'a8111111-1111-4111-8111-111111111111', 'Un libro');
insert into public.personal_goals (id, user_id, title, area, status)
values ('a8660000-0000-4000-8000-000000000001', 'a8111111-1111-4111-8111-111111111111', 'Meta', 'Salud', 'Activa');

insert into public.notebooks (id, workspace_id, title)
values ('a8dd0000-0000-4000-8000-000000000001', 'a8999999-9999-4999-8999-999999999999', 'Cuaderno');
insert into public.notes (id, notebook_id, title)
values ('a8ee0000-0000-4000-8000-000000000001', 'a8dd0000-0000-4000-8000-000000000001', 'Nota');

-- Cuenta aristas `system` entre dos entidades de negocio, por sus uuid.
create or replace function pg_temp.arista(p_desde uuid, p_rel text, p_hasta uuid)
returns int language sql stable as $$
  select count(*)::int from public.graph_edges e
   where e.source_id = public.graph_node_of(p_desde)
     and e.target_id = public.graph_node_of(p_hasta)
     and e.rel_type = p_rel and e.origin = 'system';
$$;


-- ===========================================================================
-- 1) LAS REGLAS Y LAS ARISTAS VIVAS SIGUEN DICIENDO LO MISMO
-- ===========================================================================
select is_empty(
  $$ select lado || ' ' || source_id::text || ' -> ' || target_id::text
       from public.graph_edges_deriva() $$,
  'Las reglas de graph_edge_rules derivan exactamente las aristas `system` que hay'
);


-- ===========================================================================
-- 2) LAS SIETE FUNCIONES SIGUEN SIENDO GENERADAS
--
-- Detecta el arreglo de madrugada: alguien edita a mano el cuerpo de
-- `graph_edges_task` para añadir una relación y el registro deja de ser cierto
-- sin que nada más se entere.
-- ===========================================================================
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('graph_edges_task', 'graph_edges_project', 'graph_edges_habit',
                        'graph_edges_note', 'graph_edges_task_file', 'graph_edges_assignee',
                        'graph_edges_key_result')
      and p.prosrc like '%GENERADA por public.graph_edges_ddl()%'),
  7,
  'Las siete funciones de arista las genera el registro, ninguna está escrita a mano'
);


-- ===========================================================================
-- 3-5) TAREAS — las tres relaciones que más se usan
-- ===========================================================================
select is(
  pg_temp.arista('a8bb0000-0000-4000-8000-000000000001', 'belongs_to', 'a8aa0000-0000-4000-8000-000000000001'),
  1, 'Una tarea pertenece a su proyecto (scalar_fk)'
);

update public.tasks set parent_task_id = 'a8bb0000-0000-4000-8000-000000000001'
 where id = 'a8bb0000-0000-4000-8000-000000000002';
select is(
  pg_temp.arista('a8bb0000-0000-4000-8000-000000000002', 'child_of', 'a8bb0000-0000-4000-8000-000000000001'),
  1, 'Una subtarea cuelga de su madre'
);

update public.tasks set parent_task_id = null where id = 'a8bb0000-0000-4000-8000-000000000002';
select is(
  pg_temp.arista('a8bb0000-0000-4000-8000-000000000002', 'child_of', 'a8bb0000-0000-4000-8000-000000000001'),
  0, 'Quitarle la madre borra la arista: una arista `system` no se queda de recuerdo'
);

update public.tasks
   set deps = array['a8bb0000-0000-4000-8000-000000000001'::uuid, 'a8bb0000-0000-4000-8000-000000000002'::uuid]
 where id = 'a8bb0000-0000-4000-8000-000000000003';
select is(
  pg_temp.arista('a8bb0000-0000-4000-8000-000000000003', 'depends_on', 'a8bb0000-0000-4000-8000-000000000001')
  + pg_temp.arista('a8bb0000-0000-4000-8000-000000000003', 'depends_on', 'a8bb0000-0000-4000-8000-000000000002'),
  2, 'Cada uuid de `deps` es una arista (uuid_array)'
);

update public.tasks set deps = array['a8bb0000-0000-4000-8000-000000000001'::uuid]
 where id = 'a8bb0000-0000-4000-8000-000000000003';
select is(
  pg_temp.arista('a8bb0000-0000-4000-8000-000000000003', 'depends_on', 'a8bb0000-0000-4000-8000-000000000002'),
  0, 'Quitar un uuid del array borra SOLO esa arista, no todas'
);


-- ===========================================================================
-- 6) PROYECTOS — la dependencia que 0056 convirtió en dato
-- ===========================================================================
update public.projects set depends_on = array['a8aa0000-0000-4000-8000-000000000001'::uuid]
 where id = 'a8aa0000-0000-4000-8000-000000000002';
select is(
  pg_temp.arista('a8aa0000-0000-4000-8000-000000000002', 'depends_on', 'a8aa0000-0000-4000-8000-000000000001')
  + pg_temp.arista('a8aa0000-0000-4000-8000-000000000002', 'belongs_to', 'a8999999-9999-4999-8999-999999999999'),
  2, 'Un proyecto depende de otro y pertenece a su espacio'
);


-- ===========================================================================
-- 7) HÁBITOS — el apilado ES una dependencia
-- ===========================================================================
update public.habits set stack_after_habit_id = 'a8440000-0000-4000-8000-000000000001'
 where id = 'a8440000-0000-4000-8000-000000000002';
select is(
  pg_temp.arista('a8440000-0000-4000-8000-000000000002', 'belongs_to', 'a8330000-0000-4000-8000-000000000001')
  + pg_temp.arista('a8440000-0000-4000-8000-000000000002', 'depends_on', 'a8440000-0000-4000-8000-000000000001'),
  2, 'Un hábito pertenece a su rutina y depende del que lleva apilado debajo'
);

update public.habits set stack_after_habit_id = null where id = 'a8440000-0000-4000-8000-000000000002';
select is(
  pg_temp.arista('a8440000-0000-4000-8000-000000000002', 'depends_on', 'a8440000-0000-4000-8000-000000000001'),
  0, 'Desapilar el hábito borra la dependencia'
);


-- ===========================================================================
-- 8) NOTAS — el `via_lookup` que salta el cuaderno
--
-- No hay tipo de nodo Cuaderno, así que la nota cuelga del ESPACIO de su
-- cuaderno. Es la relación que obliga al registro a saber pasar por una tabla
-- intermedia.
-- ===========================================================================
select is(
  pg_temp.arista('a8ee0000-0000-4000-8000-000000000001', 'belongs_to', 'a8999999-9999-4999-8999-999999999999'),
  1, 'Una nota cuelga del espacio de su cuaderno, saltándose el cuaderno (via_lookup)'
);


-- ===========================================================================
-- 9) ARCHIVOS — la única relación que solo nace del INSERT
-- ===========================================================================
insert into public.task_files (id, task_id, file_name, storage_path, uploaded_by)
values ('a8cc0000-0000-4000-8000-000000000001', 'a8bb0000-0000-4000-8000-000000000001',
        'acta.pdf', 'ruta/acta.pdf', 'a8111111-1111-4111-8111-111111111111');
select is(
  pg_temp.arista('a8cc0000-0000-4000-8000-000000000001', 'belongs_to', 'a8bb0000-0000-4000-8000-000000000001'),
  1, 'Un archivo adjunto pertenece a su tarea'
);


-- ===========================================================================
-- 10-11) ASIGNADOS — la tabla puente con búsqueda acotada por espacio
--
-- La persona no es el usuario: es su fila de `memberships` EN ESE ESPACIO. La
-- misma cuenta puede ser miembro de varios, así que sin acotar por el espacio
-- del nodo ancla la búsqueda elegiría una fila al azar.
-- ===========================================================================
insert into public.task_assignees (task_id, user_name, user_id) values
  ('a8bb0000-0000-4000-8000-000000000001', 'Ana',  'a8111111-1111-4111-8111-111111111111'),
  ('a8bb0000-0000-4000-8000-000000000001', 'Beto', 'a8222222-2222-4222-8222-222222222222');

select is(
  (select count(*)::int from public.graph_edges e
     join public.graph_nodes p on p.id = e.target_id
    where e.source_id = public.graph_node_of('a8bb0000-0000-4000-8000-000000000001')
      and e.rel_type = 'assigned_to'
      and p.entity_table = 'memberships'
      and p.workspace_id = 'a8999999-9999-4999-8999-999999999999'),
  2, 'Los dos asignados se dibujan, y contra la persona de ESE espacio'
);

delete from public.task_assignees
 where task_id = 'a8bb0000-0000-4000-8000-000000000001' and user_name = 'Beto';
select is(
  (select count(*)::int from public.graph_edges e
    where e.source_id = public.graph_node_of('a8bb0000-0000-4000-8000-000000000001')
      and e.rel_type = 'assigned_to'),
  1, 'Quitar un asignado borra su arista y deja la del otro: la tabla puente reconcilia el conjunto entero'
);


-- ===========================================================================
-- 12-13) RESULTADOS CLAVE — la arista que ENTRA, y el filtro de la frontera
--
-- `key_results.source_id` apunta a cinco tablas distintas y no tiene FK. Da
-- igual: `graph_node_of` busca por `entity_id`, que es único en todo el sistema,
-- así que una columna polimórfica se resuelve como cualquier otra.
--
-- Y `source_kind = 'project'` NO genera arista, a propósito: cruzaría la
-- frontera de privacidad entre una meta privada y un proyecto de espacio
-- compartido (D-120).
-- ===========================================================================
insert into public.key_results (id, goal_id, title, source_kind, source_id) values
  ('a8770000-0000-4000-8000-000000000001', 'a8660000-0000-4000-8000-000000000001', 'KR hábito',   'habit',   'a8440000-0000-4000-8000-000000000001'),
  ('a8770000-0000-4000-8000-000000000002', 'a8660000-0000-4000-8000-000000000001', 'KR libro',    'book',    'a8550000-0000-4000-8000-000000000001'),
  ('a8770000-0000-4000-8000-000000000003', 'a8660000-0000-4000-8000-000000000001', 'KR proyecto', 'project', 'a8aa0000-0000-4000-8000-000000000001');

select is(
  pg_temp.arista('a8440000-0000-4000-8000-000000000001', 'supports', 'a8660000-0000-4000-8000-000000000001')
  + pg_temp.arista('a8550000-0000-4000-8000-000000000001', 'supports', 'a8660000-0000-4000-8000-000000000001')
  + pg_temp.arista('a8aa0000-0000-4000-8000-000000000001', 'supports', 'a8660000-0000-4000-8000-000000000001'),
  2, 'El hábito y el libro apoyan la meta; el proyecto no, porque cruzaría la frontera (D-120)'
);

delete from public.key_results where id = 'a8770000-0000-4000-8000-000000000001';
select is(
  pg_temp.arista('a8440000-0000-4000-8000-000000000001', 'supports', 'a8660000-0000-4000-8000-000000000001'),
  0, 'Borrar el resultado clave borra su arista: la regla puente también se dispara con DELETE'
);


-- ===========================================================================
-- 14-15) EL VALIDADOR
-- ===========================================================================
update public.graph_edge_rules set source_column = 'columna_inventada'
 where source_table = 'notes';
select throws_ok(
  $$ select public.graph_edges_validar('notes') $$,
  'P0001', null,
  'Una regla que declara una columna inexistente se rechaza antes de generar nada'
);
update public.graph_edge_rules set source_column = 'notebook_id'
 where source_table = 'notes';

insert into public.graph_edge_rules
  (source_table, rel_type, nombre, source_column, column_kind, anchor_column, target_table, implementado_por)
values ('tasks', 'related_to', 'mezcla', 'project_id', 'scalar_fk', 'project_id', 'projects', 'graph_edges_task');
select throws_ok(
  $$ select public.graph_edges_validar('tasks') $$,
  'P0001', null,
  'Una tabla no puede mezclar reglas de ancla propia y de tabla puente: el cuerpo generado tiene una forma u otra'
);
delete from public.graph_edge_rules where nombre = 'mezcla';


-- ===========================================================================
-- 16) REINSTALAR ES IDEMPOTENTE
--
-- Si generar dos veces diera cuerpos distintos, el registro no sería una
-- descripción sino una fuente de sorpresas.
-- ===========================================================================
select is(
  public.graph_edges_ddl('tasks'),
  public.graph_edges_ddl('tasks'),
  'Generar la misma tabla dos veces da exactamente el mismo cuerpo'
);


-- ===========================================================================
-- 17) LA LIMITACIÓN QUE 0054 DEJÓ, DICHA EN VOZ ALTA
--
-- El trigger de aristas de `task_files` solo se dispara con INSERT, así que sus
-- aristas no se pueden reconstruir volviendo a guardar. Vale más que la función
-- lo diga que descubrirlo cuando el backfill devuelva «0 filas» y parezca que
-- funcionó.
-- ===========================================================================
select throws_ok(
  $$ select public.graph_backfill_edges('task_files') $$,
  'P0001', null,
  'El backfill de aristas avisa de que el trigger de task_files no se despierta con UPDATE'
);


-- ===========================================================================
-- 18) LAS FUNCIONES QUE NO SE CONCEDEN A NADIE
-- ===========================================================================
select ok(
  not has_function_privilege('anon',          'public.graph_install_edges(text)',  'execute')
  and not has_function_privilege('authenticated', 'public.graph_backfill_edges(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.graph_edges_expected()',     'execute')
  and not has_function_privilege('authenticated', 'public.graph_edges_deriva()',       'execute'),
  'Emitir DDL, reescribir tablas y leer las aristas de todo el mundo quedan fuera del alcance de una sesión de usuario'
);

select * from finish();
rollback;
