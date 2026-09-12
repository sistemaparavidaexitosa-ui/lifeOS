-- 0028_registro_del_grafo.sql — pgTAP: el registro de proyección (migración 0057).
--
-- POR QUÉ EXISTE
-- 0057 no añade una función de producto: añade una DESCRIPCIÓN de lo que el
-- grafo hace. Una descripción que nadie comprueba envejece hasta convertirse en
-- mentira, y una mentira sobre qué se proyecta es peor que no tener el
-- documento: haría que `graph_registry_deriva()` mirara donde no hay que mirar
-- y diera por buena una proyección incompleta.
--
-- La assertion nº 1 es la que sostiene el resto. Mientras esté en verde, el
-- registro y los triggers dicen lo mismo; si alguien cambia un trigger a mano y
-- no toca el registro, CI lo dice en el propio PR y no seis meses después.
--
-- La nº 10 es la que más vale a diez años: está escrita RECORRIENDO el
-- registro, así que cada fuente que se añada en los milestones siguientes —y el
-- plan es llegar a Money OS— nace con su prueba de privacidad puesta, sin que
-- nadie tenga que acordarse de escribirla.

begin;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email) values
  ('d1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'registro-duena@test.local')
on conflict (id) do nothing;


-- ===========================================================================
-- 1) LO DECLARADO Y LO INSTALADO DICEN LO MISMO
--
-- Es la assertion central de 0057. Compara estructura —función, eventos,
-- columnas vigiladas y argumentos— de los 37 triggers contra lo que el
-- registro genera para ellos.
-- ===========================================================================
select is_empty(
  $$ select entity_table || ' / ' || trigger_name || ': ' || motivo
       from public.graph_registry_diff() $$,
  'El registro describe exactamente los triggers instalados por 0054/0056'
);


-- ===========================================================================
-- 2) COBERTURA EXACTA, EN LOS DOS SENTIDOS
--
-- Lo de arriba compara las fuentes declaradas contra sus triggers. Esto
-- compara los conjuntos: una tabla proyectada que el registro no mencione es
-- justo el punto ciego que 0057 existe para cerrar.
-- ===========================================================================
select is_empty(
  $$ (select c.relname::text
        from pg_trigger t
        join pg_class c     on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where not t.tgisinternal and n.nspname = 'public'
         and t.tgname like 'trg\_graph\_%\_a\_nodo'
      except
      select entity_table from public.graph_sources where enabled)
     union all
     (select entity_table from public.graph_sources where enabled
      except
      select c.relname::text
        from pg_trigger t
        join pg_class c     on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where not t.tgisinternal and n.nspname = 'public'
         and t.tgname like 'trg\_graph\_%\_a\_nodo') $$,
  'El registro cubre las tablas proyectadas, ni una de más ni una de menos'
);


-- ===========================================================================
-- 3-4) EL VALIDADOR RECHAZA LO QUE NO ES PROYECTABLE
--
-- Las dos formas de romperlo que de verdad ocurren: renombrar una columna sin
-- tocar el registro, y declarar fuente una tabla puente. La segunda importa
-- porque el error, sin esta guarda, no saldría aquí: saldría en el `on conflict
-- (entity_id)` del proyector, en producción, la primera vez que alguien guarde.
-- ===========================================================================
insert into public.graph_sources
  (entity_table, node_type, scope, projector, label_column, tenant_column, watch_columns)
values
  ('debts', 'custom', 'user', 'user_row', 'columna_que_no_existe', 'user_id', '{columna_que_no_existe}');

select throws_ok(
  $$ select public.graph_registry_validar('debts') $$,
  'P0001',
  null,
  'Una fuente que declara una columna inexistente se rechaza al validar, no al guardar'
);

insert into public.graph_sources
  (entity_table, node_type, scope, projector, label_column, tenant_column, watch_columns)
values
  ('task_assignees', 'person', 'workspace', 'ws_row', 'user_name', 'workspace_id', '{user_name}');

select throws_ok(
  $$ select public.graph_registry_validar('task_assignees') $$,
  'P0001',
  null,
  'Una tabla de clave primaria compuesta no puede ser fuente: el on conflict (entity_id) necesita un solo uuid'
);

delete from public.graph_sources where entity_table in ('debts', 'task_assignees');


-- ===========================================================================
-- 5-6) INSTALAR UNA FUENTE ES UNA FILA, Y LO INSTALADO VUELVE A COINCIDIR
--
-- Este es el milestone entero en cuatro sentencias: declarar la fila, instalar,
-- guardar algo, y que el nodo esté ahí con su lista blanca aplicada. El
-- instalador se ejerce aquí y no en la migración a propósito — recrear los
-- triggers de `tasks` habría pedido ACCESS EXCLUSIVE sobre la tabla más
-- escrita del sistema a cambio de dejarlos idénticos.
-- ===========================================================================
create table public.zz_registro_prueba (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre  text not null,
  color   text,
  secreto text
);

insert into public.graph_sources
  (entity_table, node_type, scope, projector, label_column, tenant_column,
   metadata_fields, watch_columns)
values
  ('zz_registro_prueba', 'custom', 'user', 'user_row', 'nombre', 'user_id',
   '{color}', '{nombre,color}');

select public.graph_install_source('zz_registro_prueba');

insert into public.zz_registro_prueba (user_id, nombre, color, secreto)
values ('d1111111-1111-4111-8111-111111111111', 'Fuente nueva', 'rojo', 'no debe viajar');

select is(
  (select label || ' | ' || metadata::text
     from public.graph_nodes where entity_table = 'zz_registro_prueba'),
  'Fuente nueva | {"color": "rojo"}',
  'Declarar una fila e instalar proyecta el nodo, y la lista blanca deja fuera lo no declarado'
);

select is_empty(
  $$ select trigger_name from public.graph_registry_diff() $$,
  'Los triggers que el instalador genera vuelven a coincidir con el registro: el viaje de ida y vuelta cierra'
);


-- ===========================================================================
-- 7-8) LA DERIVA DE LOS DATOS
--
-- Que los triggers estén puestos no basta: lo que importa es que el resultado
-- siga siendo cierto. Un trigger deshabilitado no rompe nada de forma visible,
-- deja el grafo CORTO — y `graph_impact` contesta «nada depende de esto» con la
-- misma seguridad que si lo hubiera comprobado.
-- ===========================================================================
select is_empty(
  $$ select entity_table from public.graph_registry_deriva() $$,
  'Con los triggers vivos no hay deriva: toda fila de negocio tiene su nodo'
);

alter table public.zz_registro_prueba disable trigger trg_graph_zz_registro_prueba_a_nodo;
insert into public.zz_registro_prueba (user_id, nombre)
values ('d1111111-1111-4111-8111-111111111111', 'Sin proyectar');

select is(
  (select faltan::int from public.graph_registry_deriva()
    where entity_table = 'zz_registro_prueba'),
  1,
  'Con el trigger deshabilitado, la deriva señala la fuente y cuenta la fila que falta'
);

alter table public.zz_registro_prueba enable trigger trg_graph_zz_registro_prueba_a_nodo;


-- ===========================================================================
-- 9) EL BACKFILL NO ES UNA SEGUNDA DEFINICIÓN
--
-- 0054 reconstruía los nodos con catorce INSERT … SELECT que repetían la lista
-- blanca del trigger, y hacía falta una prueba para vigilar que las dos copias
-- no divergieran. Aquí no hay dos copias: el backfill vuelve a disparar el
-- trigger, así que no PUEDE divergir de él.
-- ===========================================================================
delete from public.graph_nodes where entity_table = 'zz_registro_prueba';
select public.graph_backfill_source('zz_registro_prueba');

select is(
  (select count(*)::int from public.graph_nodes where entity_table = 'zz_registro_prueba'),
  2,
  'El backfill reconstruye los nodos volviendo a disparar la proyección, no reimplementándola'
);


-- ===========================================================================
-- 10) LA FRONTERA DE PRIVACIDAD, RECORRIENDO EL REGISTRO
--
-- La invariante que más importa del módulo y la que más caro sale romper:
-- `graph_nodes` es la única tabla donde conviven una fila de Money OS y una de
-- un proyecto compartido (D-120), y lo que las separa es el `scope`. Si una
-- fuente declarada privada llegara a producir un nodo de espacio, esa fila
-- pasaría a estar bajo `graph_nodes_select_espacio` y la verían los compañeros.
--
-- Está escrita sobre `graph_sources` y no sobre una lista de tablas A PROPÓSITO:
-- el plan es proyectar Money OS entero en un milestone posterior, y una prueba
-- que enumere tablas se queda atrás en cuanto alguien añada una fila. Esta no.
-- ===========================================================================
select is_empty(
  $$ select n.entity_table || ' declarada ' || s.scope || ' y proyectada ' || n.scope
       from public.graph_nodes n
       join public.graph_sources s on s.entity_table = n.entity_table
      where n.scope is distinct from s.scope $$,
  'Ninguna fuente produce nodos en un ámbito distinto del que declara (BR-012, D-120/D-129)'
);


-- ===========================================================================
-- 11-13) LAS TRES FUNCIONES QUE NO SE CONCEDEN A NADIE
--
-- `0010_default_privileges.sql` concede EXECUTE a `anon` sobre toda función
-- nueva del esquema. Una emite DDL, otra escribe en tablas de negocio y la
-- tercera cuenta filas de todos los usuarios: las tres se revocan a mano, y
-- estas assertions son lo que detecta que alguien las vuelva a conceder.
-- ===========================================================================
select ok(
  not has_function_privilege('anon', 'public.graph_install_source(text)', 'execute'),
  'anon no puede ejecutar graph_install_source: emite DDL'
);
select ok(
  not has_function_privilege('authenticated', 'public.graph_backfill_source(text)', 'execute'),
  'authenticated no puede ejecutar graph_backfill_source: reescribe tablas de negocio'
);
select ok(
  not has_function_privilege('authenticated', 'public.graph_registry_deriva()', 'execute'),
  'authenticated no puede ejecutar graph_registry_deriva: un conteo por tabla ya dice cuánto tiene cada cual'
);


-- ===========================================================================
-- 14-15) QUE NADIE LE QUITE LOS `set` A LA FUNCIÓN QUE CAMINA SIN RLS
--
-- Mismo par que `0025_rls_grafo.sql:200-214` sobre `graph_impact`, y por la
-- misma razón: son las dos assertions que detectan que alguien «arregló» la
-- función quitándole lo que la hace segura.
-- ===========================================================================
select is(
  (select p.proconfig::text from pg_proc p
     join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'graph_registry_deriva'),
  '{search_path=public,row_security=off}',
  'graph_registry_deriva conserva su search_path y su row_security = off'
);
select is(
  (select p.provolatile::text from pg_proc p
     join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'graph_registry_deriva'),
  's',
  'graph_registry_deriva es `stable`: una función stable no puede escribir, y esta camina con la RLS apagada'
);


-- ===========================================================================
-- 16) EL REGISTRO ES CATÁLOGO: SE LEE, NO SE ESCRIBE
--
-- Una fuente es lo que decide en qué ÁMBITO nace un nodo. Si un usuario
-- autenticado pudiera declararse una, podría declarar `budgets` de ámbito
-- espacio y esperar a que el siguiente guardado le pusiera los presupuestos de
-- alguien bajo la política de espacio.
-- ===========================================================================
select ok(
  not has_table_privilege('authenticated', 'public.graph_sources', 'insert')
  and not has_table_privilege('authenticated', 'public.graph_sources', 'update')
  and not has_table_privilege('authenticated', 'public.graph_edge_rules', 'insert'),
  'El registro no lo escribe nadie desde la aplicación: la escritura se cierra con REVOKE, como los catálogos de 0054'
);


-- ===========================================================================
-- 17-18) LOS DOS CHECK QUE SOSTIENEN EL MECANISMO
--
-- El primero es el freno de la amplificación de escritura; el segundo es lo que
-- hace CORRECTO al backfill del §9: si la etiqueta no estuviera vigilada, el
-- `update … set etiqueta = etiqueta` no dispararía nada y el backfill mentiría
-- en silencio, que es la peor forma de fallar que tiene una herramienta de
-- reparación.
-- ===========================================================================
select throws_ok(
  $$ insert into public.graph_sources
       (entity_table, node_type, scope, projector, label_column, tenant_column, watch_columns)
     values ('zz_sin_vigilancia', 'custom', 'user', 'user_row', 'nombre', 'user_id', '{}') $$,
  '23514',
  null,
  'Una fuente sin columnas vigiladas se rechaza: su trigger se dispararía en cada UPDATE de la tabla'
);

select throws_ok(
  $$ insert into public.graph_sources
       (entity_table, node_type, scope, projector, label_column, tenant_column, watch_columns)
     values ('zz_etiqueta_suelta', 'custom', 'user', 'user_row', 'nombre', 'user_id', '{color}') $$,
  '23514',
  null,
  'Una fuente cuya etiqueta no está vigilada se rechaza: el backfill vuelve a disparar el trigger por la etiqueta'
);

select * from finish();
rollback;
