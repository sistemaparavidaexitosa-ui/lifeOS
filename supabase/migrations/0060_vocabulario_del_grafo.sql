-- =============================================================================
-- 0060 · EL VOCABULARIO DEL GRAFO, COMPLETO EN LA BASE
-- =============================================================================
--
-- Los dieciocho tipos de nodo están escritos CUATRO veces: en el catálogo SQL
-- (0054), en la unión `GraphNodeType` (`types.ts`), en `NODE_STYLES`
-- (`theme.ts`) y en `PLURAL` (`cluster.ts`). Las catorce relaciones, tres veces
-- más `EDGE_STYLES`. Y hay dos columnas del catálogo que el código reimplementa
-- en vez de leer: `is_dependency` vuelve a estar escrita como un `Set` en
-- `impact.ts`, y `is_projected` como la lista `TIPOS_NATIVOS` en las Server
-- Actions. Hoy coinciden por suerte, no por construcción.
--
-- El milestone 4 las reduce a una, generando el TypeScript desde el catálogo.
-- Para poder hacerlo, el catálogo tiene que llevar TODO lo que es vocabulario,
-- y ahora mismo le faltan dos cosas.
--
-- LA LÍNEA QUE SE TRAZA AQUÍ, y conviene dejarla escrita porque la siguiente
-- persona va a querer moverla: **la base es dueña de las PALABRAS y de la
-- SEMÁNTICA; TypeScript es dueño de la GEOMETRÍA.**
--
--   · A la base: el nombre del tipo, su etiqueta, su plural, su color, si se
--     proyecta, si es dependencia, si va invertida, si es simétrica, y en qué
--     pantalla vive la entidad. Todo eso lo puede necesitar una consulta, un
--     informe o la IA.
--   · A TypeScript: el radio del círculo, el grosor del trazo, si la línea va
--     discontinua y si lleva punta de flecha. Eso no lo va a leer nunca nadie
--     desde SQL, y meterlo aquí sería guardar píxeles en Postgres.
--
-- El tipo generado hace que esa frontera se sostenga sola: los `Record` de
-- geometría van indexados por la unión generada, así que **añadir un tipo de
-- nodo con un INSERT rompe la compilación** hasta que alguien diga de qué
-- tamaño se dibuja. Que es exactamente la pregunta que hay que contestar.
--
-- Ver `docs/UNIVERSAL_GRAPH_ROADMAP.md` §M4 y D-147.
-- =============================================================================


-- =============================================================================
-- 1) EL PLURAL
--
-- `graph_node_types.label` ya lleva el singular («Tarea»), así que el plural es
-- exactamente la misma clase de dato y no tenía por qué vivir en otro idioma y
-- en otro archivo. Lo usa el agrupador del lienzo para decir «12 tareas», en
-- minúscula y dentro de una frase, que es por lo que no es `lower(label) || 's'`:
-- «decisiones», «inversiones» y «nodos» no salen de ninguna regla.
-- =============================================================================

alter table public.graph_node_types
  add column if not exists label_plural text not null default '';

comment on column public.graph_node_types.label_plural is
  'El plural en minúscula, para frases como «12 tareas». Lo lee el agrupador del lienzo a través del catálogo generado. Ver 0060.';

update public.graph_node_types set label_plural = v.plural
from (values
  ('workspace', 'espacios'), ('project', 'proyectos'), ('task', 'tareas'),
  ('goal', 'metas'), ('habit', 'hábitos'), ('routine', 'rutinas'),
  ('book', 'libros'), ('note', 'notas'), ('document', 'documentos'),
  ('decision', 'decisiones'), ('person', 'personas'),
  ('investment', 'inversiones'), ('budget', 'presupuestos'), ('asset', 'activos'),
  ('ai_conversation', 'conversaciones'), ('meeting', 'reuniones'),
  ('risk', 'riesgos'), ('custom', 'nodos')
) as v(node_type, plural)
where public.graph_node_types.node_type = v.node_type;

-- Un plural vacío saldría en la interfaz como «12 » y nadie se enteraría hasta
-- verlo. Mejor que no se pueda insertar.
alter table public.graph_node_types
  add constraint graph_node_types_plural_no_vacio check (btrim(label_plural) <> '');


-- =============================================================================
-- 2) LA PANTALLA DONDE VIVE CADA COSA
--
-- `NodeInspector.tsx` lleva un `Record` de doce entradas que traduce
-- `entity_table` a la ruta de la aplicación, y le faltan DOS: `task_files` y
-- `logbook`. La consecuencia es visible y llevaba ahí desde 0054 — un nodo de
-- tipo Documento o Decisión no tiene enlace para «abrir donde vive», así que se
-- puede ver en el mapa y no se puede llegar a él.
--
-- Al registro y no al catálogo de tipos porque la clave correcta es la TABLA,
-- no el tipo: los cuatro tipos nativos (`custom`, `risk`, `meeting`,
-- `ai_conversation`) no tienen tabla detrás y por tanto no tienen dónde abrirse.
--
-- `{id}` es el único marcador, y se sustituye en el cliente. No se usa `%s` ni
-- `format()`: esto lo consume TypeScript, no SQL.
--
-- Las rutas se comprobaron contra `src/app/(app)/**/page.tsx` una a una. Dos
-- salen a `/execution` sin parámetro y no es pereza: la bitácora se abre dentro
-- de `ProjectMenu` y los adjuntos dentro de `TaskFilesPanel`, así que ninguno
-- de los dos tiene URL propia a la que enlazar. Llevar a la pantalla correcta
-- es lo máximo que se puede prometer hoy sin inventarse una ruta.
-- =============================================================================

alter table public.graph_sources
  add column if not exists route_template text not null default '';

comment on column public.graph_sources.route_template is
  'La ruta de la aplicación donde vive esta entidad, con `{id}` como único marcador. La usa el panel del grafo para el enlace «abrir donde vive». Ver 0060.';

update public.graph_sources set route_template = v.ruta
from (values
  ('projects',       '/execution?project={id}'),
  ('tasks',          '/execution'),
  ('notes',          '/notebooks'),
  ('task_files',     '/execution'),
  ('logbook',        '/execution'),
  ('workspaces',     '/execution'),
  ('memberships',    '/execution'),
  ('personal_goals', '/development/goals'),
  ('habits',         '/development/routines'),
  ('routines',       '/development/routines'),
  ('books',          '/development/library'),
  ('investments',    '/investments'),
  ('budgets',        '/money/budget'),
  ('assets',         '/wealth')
) as v(entity_table, ruta)
where public.graph_sources.entity_table = v.entity_table;

alter table public.graph_sources
  add constraint graph_sources_ruta_no_vacia check (btrim(route_template) <> '');


-- =============================================================================
-- 3) QUE NO QUEDE NINGUNA FILA A MEDIAS
--
-- Los dos CHECK de arriba impiden insertar una fila incompleta a partir de hoy.
-- Esto comprueba lo otro: que la siembra de arriba haya alcanzado a TODAS las
-- filas que ya existían. Un `update … from (values …)` que no case por un
-- nombre mal escrito no da error, deja la fila con el valor por defecto.
-- =============================================================================

do $$
declare
  v_tipos  text;
  v_rutas  text;
begin
  select string_agg(node_type, ', ') into v_tipos
    from public.graph_node_types where btrim(label_plural) = '';
  select string_agg(entity_table, ', ') into v_rutas
    from public.graph_sources where btrim(route_template) = '';

  if v_tipos is not null then
    raise exception 'graph: estos tipos de nodo se quedaron sin plural: %', v_tipos
      using errcode = 'P0001';
  end if;
  if v_rutas is not null then
    raise exception 'graph: estas fuentes se quedaron sin ruta: %', v_rutas
      using errcode = 'P0001';
  end if;
end $$;


-- =============================================================================
-- CÓMO SE REVIERTE
--
--   alter table public.graph_sources
--     drop constraint graph_sources_ruta_no_vacia, drop column route_template;
--   alter table public.graph_node_types
--     drop constraint graph_node_types_plural_no_vacio, drop column label_plural;
--
-- Y regenerar `src/lib/domain/graph/catalog.generated.ts` contra la base ya
-- revertida, o el TypeScript seguirá esperando columnas que ya no existen.
-- =============================================================================
