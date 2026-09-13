-- 0031_vocabulario_del_grafo.sql — pgTAP: el vocabulario completo (0060).
--
-- POR QUÉ EXISTE
-- 0060 mueve a la base dos cosas que vivían solo en TypeScript —el plural de
-- cada tipo y la pantalla donde vive cada entidad— para poder generar el
-- vocabulario desde el catálogo. El modo de fallo de las dos es el mismo y es
-- silencioso: una fila incompleta no rompe nada, solo hace que la interfaz
-- enseñe «12 » sin nombre, o que un nodo no tenga enlace para abrirse. Eso es
-- justo lo que le pasaba a Documento y a Decisión desde 0054.

begin;
select plan(6);

select is_empty(
  $$ select node_type from public.graph_node_types where btrim(label_plural) = '' $$,
  'Todos los tipos de nodo tienen plural'
);

select is_empty(
  $$ select entity_table from public.graph_sources where enabled and btrim(route_template) = '' $$,
  'Todas las fuentes habilitadas dicen a qué pantalla llevan'
);

select is_empty(
  $$ select entity_table from public.graph_sources
      where enabled and route_template not like '/%' $$,
  'Toda ruta es una ruta de la aplicación, no una URL ni un fragmento suelto'
);

-- Las dos que faltaban en el mapa escrito a mano de NodeInspector.tsx: un nodo
-- de tipo Documento o Decisión se veía en el grafo y no se podía abrir.
select is(
  (select count(*)::int from public.graph_sources
    where entity_table in ('task_files', 'logbook') and btrim(route_template) <> ''),
  2,
  'Documento y Decisión ya tienen dónde abrirse'
);

select throws_ok(
  $$ insert into public.graph_node_types (node_type, label, label_plural, color)
     values ('zz_sin_plural', 'Sin plural', '   ', 'var(--muted)') $$,
  '23514', null,
  'Un tipo de nodo sin plural se rechaza: si no, la interfaz enseñaría «12 » y nadie se enteraría'
);

select throws_ok(
  $$ insert into public.graph_sources
       (entity_table, node_type, scope, projector, label_column, tenant_column,
        watch_columns, route_template)
     values ('zz_sin_ruta', 'custom', 'user', 'user_row', 'nombre', 'user_id',
             '{nombre}', '') $$,
  '23514', null,
  'Una fuente sin ruta se rechaza: una entidad proyectada que no se puede abrir es media función'
);

select * from finish();
rollback;
