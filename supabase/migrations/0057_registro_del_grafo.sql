-- =============================================================================
-- 0057 · EL REGISTRO DEL GRAFO
-- =============================================================================
--
-- 0054 dejó el grafo bien resuelto y con una pieza fuera: QUÉ se proyecta y
-- CÓMO solo se sabe leyendo las sentencias `create trigger` del final de aquel
-- archivo. La base no puede contestar «¿qué entidades de LifeOS son nodos?»,
-- y de ahí salen tres consecuencias que ya se pagan hoy:
--
--   1. La lista blanca de metadatos está escrita DOS VECES para cada tabla
--      genérica: una en el argumento del trigger (0054:1498) y otra en el
--      SELECT del backfill (0054:1291). La assertion nº 9 de
--      `0025_rls_grafo.sql` existe únicamente para vigilar que no diverjan —
--      o sea, hay una prueba dedicada a un problema que no debería existir.
--
--   2. No hay forma de detectar DERIVA. Si un trigger deja de dispararse, el
--      grafo no se rompe de forma visible: se queda corto. Y `graph_impact`
--      contesta «nada depende de esto» con la misma seguridad que si fuera
--      cierto, que es el peor modo de fallo que este módulo puede tener.
--
--   3. Añadir una entidad toca tres sitios del SQL y cuatro de TypeScript.
--
-- Esta migración NO cambia el comportamiento de nada. Añade la descripción
-- declarativa que faltaba —qué tabla es qué nodo, con qué etiqueta, qué
-- metadatos y qué columnas vigila— y las funciones que la usan: un instalador,
-- un backfill y un detector de deriva.
--
-- LA DECISIÓN QUE SOSTIENE EL DISEÑO: el SQL dinámico corre en tiempo de DDL,
-- NUNCA por fila. `graph_install_source()` valida contra `information_schema`
-- y emite un `create trigger` estático; el cuerpo que se ejecuta en cada UPDATE
-- sigue siendo el mismo plpgsql compilado de hoy, con su plan en caché. Es
-- exactamente la objeción que D-119 dejó escrita contra «una función genérica
-- con execute format», respetada: aquí no hay intérprete en el camino caliente.
--
-- Y ESTA MIGRACIÓN NO RECREA NINGÚN TRIGGER EXISTENTE. Los COMPARA. `create
-- trigger` sobre `tasks` exige ACCESS EXCLUSIVE y encola detrás a todos los
-- lectores nuevos —el riesgo real que 0054 documentó y contuvo con
-- `lock_timeout`—, y aquí no hace falta correrlo: comparar demuestra lo mismo
-- sin bloquear nada. Consecuencia buena y buscada: el grafo NO depende del
-- registro para funcionar, así que revertir esta migración es un `drop table`
-- y los 37 triggers de 0054/0056 siguen donde estaban.
--
-- Ver `docs/UNIVERSAL_GRAPH_ROADMAP.md` y D-138…D-141 en `docs/DECISIONS.md`.
-- =============================================================================


-- =============================================================================
-- 1) LAS TABLAS DEL REGISTRO
--
-- Son CATÁLOGO, de la misma familia que `graph_node_types` y `graph_rel_types`
-- (0054:57-79) y con su mismo contrato de permisos: lectura para cualquiera
-- autenticado, escritura cerrada con REVOKE y no con políticas. Un catálogo
-- crece con un INSERT en una migración; nadie lo edita desde la aplicación.
-- =============================================================================

create table if not exists public.graph_sources (
  entity_table     text primary key,
  node_type        text not null references public.graph_node_types(node_type),
  scope            text not null check (scope in ('user', 'workspace')),

  -- Qué función de proyección la mantiene. Las dos primeras son GENÉRICAS y se
  -- parametrizan con los argumentos del trigger; las cuatro siguientes son a
  -- medida porque resuelven el dueño con uno o dos saltos (0054 §9). El eje no
  -- es la tabla, es de dónde sale el dueño.
  projector        text not null check (projector in
                     ('user_row', 'ws_row', 'task', 'note', 'task_file', 'decision')),

  label_column     text not null,
  tenant_column    text,
  project_column   text,
  parent_table     text,
  parent_column    text,
  metadata_fields  text[] not null default '{}',

  -- La lista del `after insert or update of …`. Es el freno de la amplificación
  -- de escritura: se evalúa UNA VEZ POR SENTENCIA contra el SET, así que el
  -- reordenado masivo del tablero (0021) ni roza el trigger. Por eso no puede
  -- estar vacía: una fuente sin lista vigilaría cada UPDATE de la tabla.
  watch_columns    text[] not null,

  row_filter       text,

  -- `workspaces` no lleva trigger de borrado y no es un olvido: el nodo cuelga
  -- de `graph_nodes.workspace_id`, que ya es ON DELETE CASCADE. El registro
  -- tiene que poder decir eso en vez de suponerlo.
  delete_trigger   boolean not null default true,

  enabled          boolean not null default true,
  notes            text not null default '',

  constraint graph_sources_watch_no_vacio
    check (cardinality(watch_columns) > 0),

  -- La etiqueta tiene que estar VIGILADA, y no es una comodidad: es lo que
  -- hace correcto a `graph_backfill_source()`, que reconstruye los nodos
  -- volviendo a disparar el trigger con `update … set etiqueta = etiqueta`.
  -- Si la etiqueta no estuviera en la lista del `update of`, ese UPDATE no
  -- dispararía nada y el backfill mentiría en silencio.
  constraint graph_sources_etiqueta_vigilada
    check (label_column = any (watch_columns)),
  constraint graph_sources_generico_declara_tenant
    check (projector not in ('user_row', 'ws_row') or tenant_column is not null)
);

comment on table public.graph_sources is
  'El registro de proyección: qué tabla de negocio se convierte en qué nodo, con qué etiqueta, qué metadatos y qué columnas la disparan. Es la descripción declarativa de lo que 0054 dejó escrito solo dentro de sus CREATE TRIGGER. Ver 0057.';
comment on column public.graph_sources.watch_columns is
  'La lista del AFTER INSERT OR UPDATE OF. No puede estar vacía: sin ella el trigger se dispararía en cada UPDATE de la tabla.';
comment on column public.graph_sources.metadata_fields is
  'Lista BLANCA de campos que viajan a graph_nodes.metadata. Nunca una lista negra: una lista negra falla en abierto, y proyectar budgets o investments significa duplicar importes en una tabla nueva.';
comment on column public.graph_sources.row_filter is
  'Condición SQL que decide qué filas se proyectan, para las tablas que no proyectan todas. Hoy solo logbook, que solo es nodo cuando type = ''decision''.';


create table if not exists public.graph_edge_rules (
  source_table     text not null,
  rel_type         text not null references public.graph_rel_types(rel_type),
  nombre           text not null,
  source_column    text not null,
  column_kind      text not null check (column_kind in
                     ('scalar_fk', 'uuid_array', 'via_lookup', 'polymorphic')),

  -- De qué nodo CUELGA la arista. Null significa «el nodo de esta misma fila»,
  -- que es el caso normal. No lo es cuando la fila es una tabla puente: en
  -- `task_assignees` la arista va de la TAREA a la persona, y en `key_results`
  -- entra en la META. Sin esta columna la regla no diría de dónde sale.
  anchor_column    text,
  target_table     text not null default '',
  direction        text not null default 'out' check (direction in ('out', 'in')),
  row_filter       text,

  -- Qué función la mantiene HOY. En M1 las siete siguen escritas a mano y esta
  -- tabla las DESCRIBE; M2 las sustituye por una genérica dirigida por estas
  -- filas. Decirlo en una columna evita que el registro parezca más de lo que
  -- es mientras tanto.
  implementado_por text not null,
  notes            text not null default '',

  primary key (source_table, rel_type, nombre)
);

comment on table public.graph_edge_rules is
  'Las relaciones del dominio que nacen como aristas `system`, declaradas como dato. En 0057 describen lo que las siete funciones de arista de 0054 hacen a mano; el milestone 2 las convierte en lo que las ejecuta. Ver docs/UNIVERSAL_GRAPH_ROADMAP.md.';
comment on column public.graph_edge_rules.direction is
  '`out`: la arista sale del nodo de esta fila. `in`: entra en él — es el caso de key_results, donde la arista va de la fuente (hábito o libro) HACIA la meta.';


-- =============================================================================
-- 2) RLS Y PERMISOS — el contrato de catálogo de 0054:119-127 y 483-484
-- =============================================================================

alter table public.graph_sources    enable row level security;
alter table public.graph_edge_rules enable row level security;

create policy graph_sources_lectura on public.graph_sources
  for select using (auth.role() = 'authenticated');
create policy graph_edge_rules_lectura on public.graph_edge_rules
  for select using (auth.role() = 'authenticated');

grant select on public.graph_sources    to anon, authenticated;
grant select on public.graph_edge_rules to anon, authenticated;
grant all privileges on public.graph_sources    to service_role;
grant all privileges on public.graph_edge_rules to service_role;

-- 0002 deja un default grant sobre toda tabla nueva del esquema, y hay que
-- deshacerlo a mano. Sin esto, cualquier usuario autenticado podría declararse
-- una fuente nueva — y una fuente es lo que decide en qué ÁMBITO nace un nodo.
revoke insert, update, delete on public.graph_sources    from anon, authenticated;
revoke insert, update, delete on public.graph_edge_rules from anon, authenticated;


-- =============================================================================
-- 3) LA SIEMBRA — las catorce fuentes vivas
--
-- Transcritas de `pg_get_triggerdef()` sobre la base ya migrada, no de leer el
-- archivo 0054: entre el archivo y lo que acabó instalado hay dos migraciones
-- (0055, 0056) que reescribieron parte, y una transcripción a ojo habría
-- heredado esa diferencia. El bloque de comprobación del §7 demuestra que la
-- transcripción es exacta.
-- =============================================================================

insert into public.graph_sources (
  entity_table, node_type, scope, projector, label_column,
  tenant_column, project_column, parent_table, parent_column,
  metadata_fields, watch_columns, row_filter, delete_trigger, notes
) values

  -- --- Ámbito PRIVADO: el dueño está en la propia fila -----------------------
  ('personal_goals', 'goal', 'user', 'user_row', 'title',
   'user_id', null, null, null,
   '{status,area,horizon,achieved_at}',
   '{title,status,area,horizon,achieved_at}', null, true, ''),

  ('habits', 'habit', 'user', 'user_row', 'name',
   'user_id', null, null, null,
   '{category,cue,duration_min,meal}',
   '{name,category,cue,duration_min,meal}', null, true, ''),

  ('routines', 'routine', 'user', 'user_row', 'name',
   'user_id', null, null, null,
   '{frequency,active,identity}',
   '{name,frequency,active,identity}', null, true, ''),

  ('books', 'book', 'user', 'user_row', 'title',
   'user_id', null, null, null,
   '{status,category,author,current_page,total_pages}',
   '{title,status,category,author,current_page,total_pages}', null, true, ''),

  ('investments', 'investment', 'user', 'user_row', 'name',
   'user_id', null, null, null,
   '{kind,institution,currency,valuation}',
   '{name,kind,institution,currency,valuation}', null, true, ''),

  ('budgets', 'budget', 'user', 'user_row', 'category',
   'user_id', null, null, null,
   '{period,cycle,amount,monthly_cost}',
   '{category,period,cycle,amount,monthly_cost}', null, true,
   'La etiqueta es la categoría porque un presupuesto no tiene nombre propio.'),

  ('assets', 'asset', 'user', 'user_row', 'name',
   'user_id', null, null, null,
   '{kind,currency,value}',
   '{name,kind,currency,value}', null, true, ''),

  -- --- Ámbito ESPACIO: el dueño está en la propia fila ------------------------
  ('workspaces', 'workspace', 'workspace', 'ws_row', 'name',
   'id', null, null, null,
   '{is_personal,color}',
   '{name,is_personal,color}', null, false,
   'Sin trigger de borrado: el nodo cuelga de graph_nodes.workspace_id, que ya es ON DELETE CASCADE.'),

  ('projects', 'project', 'workspace', 'ws_row', 'title',
   'workspace_id', 'id', null, null,
   '{status,priority,area,target_date}',
   '{title,status,priority,area,target_date,workspace_id}', null, true,
   'project_column = ''id'': un proyecto es su propio proyecto, y es lo que permite a la RLS llamar a has_project_access() sobre su nodo.'),

  ('memberships', 'person', 'workspace', 'ws_row', 'user_name',
   'workspace_id', '', null, null,
   '{role,status}',
   '{user_name,role,status}', null, true, ''),

  -- --- Proyectores a medida: el dueño está a uno o dos saltos ----------------
  ('tasks', 'task', 'workspace', 'task', 'title',
   null, null, 'projects', 'project_id',
   '{status,priority,due,urgent,impact,est,completed_at}',
   '{title,status,priority,due,urgent,impact,est,completed_at,project_id}', null, true,
   'Función propia y sin to_jsonb: es la tabla que más se escribe del sistema.'),

  ('notes', 'note', 'workspace', 'note', 'title',
   null, null, 'notebooks', 'notebook_id',
   '{notebook_id}',
   '{title,notebook_id}', null, true,
   'Dos saltos: notes -> notebooks.workspace_id. No hay tipo de nodo Cuaderno, así que la nota cuelga del espacio.'),

  ('task_files', 'document', 'workspace', 'task_file', 'file_name',
   null, null, 'tasks', 'task_id',
   '{content_type,size_bytes}',
   '{file_name}', null, true,
   'Tres saltos: task_files -> tasks -> projects.workspace_id.'),

  ('logbook', 'decision', 'user', 'decision', 'text',
   'user_id', null, null, null,
   '{}',
   '{text,type,project_id}', 'type = ''decision''', true,
   'La única fuente con filtro de fila: la bitácora solo es nodo cuando la entrada es una Decisión. La etiqueta se recorta a 120 caracteres dentro del proyector.');


-- =============================================================================
-- 4) LA SIEMBRA — las once relaciones que el dominio ya tenía
--
-- Esto es lo que hace que el grafo naciera con datos reales en vez de vacío:
-- `tasks.deps` lleva en la base desde 0003 y nadie la había visto dibujada.
-- Aquí quedan declaradas; en 0057 siguen ejecutándolas las siete funciones a
-- mano de 0054, y `implementado_por` dice cuál. El milestone 2 invierte esa
-- relación: la fila pasa a ser lo que se ejecuta y las funciones desaparecen.
-- =============================================================================

insert into public.graph_edge_rules (
  source_table, rel_type, nombre, source_column, column_kind, anchor_column,
  target_table, direction, row_filter, implementado_por, notes
) values

  ('tasks', 'belongs_to', 'proyecto', 'project_id', 'scalar_fk', null,
   'projects', 'out', null, 'graph_edges_task', ''),
  ('tasks', 'child_of', 'padre', 'parent_task_id', 'scalar_fk', null,
   'tasks', 'out', null, 'graph_edges_task', ''),
  ('tasks', 'depends_on', 'deps', 'deps', 'uuid_array', null,
   'tasks', 'out', null, 'graph_edges_task',
   '`deps` es «de qué depende esta tarea», así que la flecha SALE de la tarea y depends_on está marcada como reversed: el impacto viaja al revés.'),

  ('projects', 'belongs_to', 'espacio', 'workspace_id', 'scalar_fk', null,
   'workspaces', 'out', null, 'graph_edges_project', ''),
  ('projects', 'depends_on', 'depends_on', 'depends_on', 'uuid_array', null,
   'projects', 'out', null, 'graph_edges_project',
   'Añadida en 0056. Misma forma que tasks.deps para no meter una segunda manera de expresar lo mismo.'),

  ('habits', 'belongs_to', 'rutina', 'routine_id', 'scalar_fk', null,
   'routines', 'out', null, 'graph_edges_habit', ''),
  ('habits', 'depends_on', 'apilado', 'stack_after_habit_id', 'scalar_fk', null,
   'habits', 'out', null, 'graph_edges_habit',
   'El apilado de hábitos (0033) ES una dependencia: «después de X, hago Y».'),

  ('notes', 'belongs_to', 'espacio', 'notebook_id', 'via_lookup', null,
   'workspaces', 'out', null, 'graph_edges_note',
   'Salta el cuaderno: notes.notebook_id -> notebooks.workspace_id. No hay tipo de nodo Cuaderno.'),

  ('task_files', 'belongs_to', 'tarea', 'task_id', 'scalar_fk', null,
   'tasks', 'out', null, 'graph_edges_task_file', ''),

  ('task_assignees', 'assigned_to', 'persona', 'user_id', 'via_lookup', 'task_id',
   'memberships', 'out', null, 'graph_edges_assignee',
   'Tabla puente: la arista va de la TAREA a la persona, y la persona se resuelve por (workspace_id, user_id) sobre memberships.'),

  ('key_results', 'supports', 'fuente', 'source_id', 'polymorphic', 'goal_id',
   'personal_goals', 'in', 'source_kind in (''habit'', ''book'')', 'graph_edges_key_result',
   'source_id es un puntero polimórfico sin FK (0035). Solo las fuentes PRIVADAS generan arista: source_kind = ''project'' cruzaría la frontera de BR-012 y se descarta — ver D-120.');


-- =============================================================================
-- 5) VALIDACIÓN — que una fuente declarada sea realmente proyectable
--
-- Corre ANTES de emitir DDL, no después. Una fila de registro con una columna
-- inventada no da error al insertarse: lo daría el trigger, en producción, la
-- primera vez que alguien guarde algo. Mejor que lo diga la migración.
-- =============================================================================

create or replace function public.graph_registry_validar(p_entity_table text)
returns void
language plpgsql
stable
set search_path = public
as $fn$
declare
  v        public.graph_sources%rowtype;
  v_oid    oid;
  v_pk     text[];
  v_pktipo text;
  v_col    text;
  v_falta  text[] := '{}';
begin
  select * into v from public.graph_sources s where s.entity_table = p_entity_table;
  if not found then
    raise exception 'graph: «%» no está en el registro de fuentes.', p_entity_table
      using errcode = 'P0001';
  end if;

  v_oid := to_regclass('public.' || quote_ident(v.entity_table));
  if v_oid is null then
    raise exception 'graph: la fuente «%» declara una tabla que no existe.', v.entity_table
      using errcode = 'P0001';
  end if;

  -- LA CLAVE PRIMARIA TIENE QUE SER UNA SOLA COLUMNA `id` DE TIPO uuid, y no
  -- es ceremonia: todos los proyectores hacen `on conflict (entity_id)` contra
  -- el índice único parcial `idx_graph_nodes_entity` (0054:201) y escriben
  -- `new.id`. Seis tablas del esquema no cumplen —`profiles`,
  -- `notification_prefs` y `nutrition_profiles` tienen la PK en `user_id`, y
  -- `task_assignees`, `comment_reads` y `comment_reactions` la tienen
  -- compuesta— y no pueden ser fuentes sin cambiar el núcleo. Que lo diga aquí
  -- y no un trigger a las tres de la mañana.
  select coalesce(array_agg(a.attname::text order by a.attname), '{}'),
         max(format_type(a.atttypid, null))
    into v_pk, v_pktipo
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
  where i.indrelid = v_oid and i.indisprimary;

  if v_pk is distinct from array['id']::text[] or v_pktipo is distinct from 'uuid' then
    raise exception
      'graph: «%» no puede ser fuente — su clave primaria es % y tiene que ser una sola columna «id» de tipo uuid.',
      v.entity_table, coalesce(array_to_string(v_pk, ', '), '(ninguna)')
      using errcode = 'P0001';
  end if;

  -- Todas las columnas declaradas tienen que existir de verdad.
  -- `coalesce(array[x], '{}')` NO sirve aquí: `array[null]` es `{NULL}`, no es
  -- null, y colaría un NULL en la lista que luego se reporta como una columna
  -- que falta y sin nombre. Hay que preguntar por la columna, no por el array.
  foreach v_col in array (
    array[v.label_column]
    || case when v.tenant_column  is null then '{}'::text[] else array[v.tenant_column]  end
    || case when coalesce(v.project_column, '') = '' then '{}'::text[] else array[v.project_column] end
    || case when v.parent_column  is null then '{}'::text[] else array[v.parent_column]  end
    || v.metadata_fields
    || v.watch_columns
  ) loop
    if not exists (
      select 1 from pg_attribute a
      where a.attrelid = v_oid and a.attname = v_col and a.attnum > 0 and not a.attisdropped
    ) then
      v_falta := v_falta || v_col;
    end if;
  end loop;

  if cardinality(v_falta) > 0 then
    raise exception 'graph: la fuente «%» declara columnas que no existen: %.',
      v.entity_table, array_to_string(v_falta, ', ')
      using errcode = 'P0001';
  end if;
end;
$fn$;

comment on function public.graph_registry_validar(text) is
  'Comprueba que una fila de graph_sources sea proyectable: la tabla existe, su PK es un solo uuid llamado id, y todas las columnas declaradas existen. Lanza P0001 con el nombre de lo que falta. Ver 0057.';


-- =============================================================================
-- 6) EL DDL — lo que el registro DICE que tendría que estar instalado
--
-- `graph_registry_args` es la pieza que hace genéricos a los dos proyectores
-- de 0054: el orden de los argumentos ES el contrato de `tg_argv` que leen
-- `graph_project_user_row` y `graph_project_ws_row`. Los cuatro proyectores a
-- medida no llevan argumentos porque su contrato está en el cuerpo.
-- =============================================================================

create or replace function public.graph_registry_args(p_entity_table text)
returns text[]
language sql
stable
set search_path = public
as $fn$
  select case s.projector
    when 'user_row' then array[s.node_type, s.label_column] || s.metadata_fields
    when 'ws_row'   then array[s.node_type, s.label_column, s.tenant_column,
                               coalesce(s.project_column, '')] || s.metadata_fields
    else '{}'::text[]
  end
  from public.graph_sources s
  where s.entity_table = p_entity_table;
$fn$;

create or replace function public.graph_registry_funcion(p_projector text)
returns text
language sql
immutable
as $fn$
  select case p_projector
    when 'user_row'  then 'graph_project_user_row'
    when 'ws_row'    then 'graph_project_ws_row'
    when 'task'      then 'graph_project_task'
    when 'note'      then 'graph_project_note'
    when 'task_file' then 'graph_project_task_file'
    when 'decision'  then 'graph_project_decision'
  end;
$fn$;


create or replace function public.graph_registry_ddl(p_entity_table text)
returns text[]
language plpgsql
stable
set search_path = public
as $fn$
declare
  v    public.graph_sources%rowtype;
  v_out text[] := '{}';
  v_args text[];
begin
  select * into v from public.graph_sources s where s.entity_table = p_entity_table;
  if not found then
    raise exception 'graph: «%» no está en el registro de fuentes.', p_entity_table
      using errcode = 'P0001';
  end if;

  v_args := public.graph_registry_args(v.entity_table);

  -- `%I` en TODO identificador. El registro solo lo escriben las migraciones
  -- —la escritura está revocada de anon y authenticated en el §2— pero una
  -- función que emite DDL se escribe como si no lo estuviera.
  v_out := v_out || format(
    'create trigger %I after insert or update of %s on public.%I for each row execute function public.%I(%s)',
    'trg_graph_' || v.entity_table || '_a_nodo',
    (select string_agg(quote_ident(c), ', ') from unnest(v.watch_columns) as c),
    v.entity_table,
    public.graph_registry_funcion(v.projector),
    coalesce((select string_agg(quote_literal(a), ', ') from unnest(v_args) as a), '')
  );

  -- El borrado va aparte y como trigger de SENTENCIA con tabla de transición:
  -- borrar un proyecto de 5.000 tareas dispararía si no 5.000 triggers de fila.
  -- Que INSERT/UPDATE y DELETE usen mecanismos distintos es deliberado.
  if v.delete_trigger then
    v_out := v_out || format(
      'create trigger %I after delete on public.%I referencing old table as borradas for each statement execute function public.graph_unproject_batch()',
      'trg_graph_' || v.entity_table || '_z_borrado',
      v.entity_table
    );
  end if;

  return v_out;
end;
$fn$;

comment on function public.graph_registry_ddl(text) is
  'Las sentencias CREATE TRIGGER que corresponden a una fila del registro. Función pura: no instala nada. La usa graph_install_source(), y graph_registry_diff() comprueba contra ella que lo instalado y lo declarado no hayan divergido.';


create or replace function public.graph_install_source(p_entity_table text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_sql text;
begin
  perform public.graph_registry_validar(p_entity_table);
  foreach v_sql in array public.graph_registry_ddl(p_entity_table) loop
    execute v_sql;
  end loop;
end;
$fn$;

comment on function public.graph_install_source(text) is
  'Instala los triggers de proyección de una fuente del registro. SQL dinámico en tiempo de DDL, nunca por fila: el cuerpo que corre en cada UPDATE sigue siendo el plpgsql compilado de 0054. Solo se invoca desde migraciones — ver D-138.';


-- =============================================================================
-- 7) LA GUARDIA — que lo declarado y lo instalado no diverjan
--
-- Compara ESTRUCTURA, no texto: nombre, función, eventos, columnas vigiladas y
-- argumentos, leídos de `pg_trigger`. Comparar el texto de
-- `pg_get_triggerdef()` habría sido más corto y habría atado la prueba al
-- formato con que una versión concreta de Postgres imprime el DDL: el día de
-- una actualización mayor, CI se pondría en rojo por un espacio. Esto compara
-- lo que significa.
--
-- Es la función que convierte al registro en carga real. Sin ella sería
-- documentación que envejece; con ella, cambiar un trigger a mano y no tocar el
-- registro rompe la prueba pgTAP 0028 y CI lo dice en el propio PR.
-- =============================================================================

create or replace function public.graph_registry_diff()
returns table (entity_table text, trigger_name text, motivo text)
language sql
stable
set search_path = public
as $fn$
  with vivos as (
    select c.relname::text          as tabla,
           t.tgname::text           as nombre,
           t.tgfoid::regproc::text  as fn,
           t.tgtype                 as tipo,
           coalesce((select array_agg(a.attname::text order by k.ord)
                       from unnest(t.tgattr::int2[]) with ordinality k(n, ord)
                       join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = k.n),
                    '{}'::text[])   as cols,
           coalesce((select array_agg(x order by i)
                       from unnest(string_to_array(encode(t.tgargs, 'escape'), '\000'))
                            with ordinality u(x, i)
                      where i <= t.tgnargs),
                    '{}'::text[])   as args
    from pg_trigger t
    join pg_class c     on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and t.tgname like 'trg\_graph\_%'
  ),
  esperado as (
    -- tgtype 21 = ROW (1) + INSERT (4) + UPDATE (16).
    select s.entity_table                                as tabla,
           'trg_graph_' || s.entity_table || '_a_nodo'   as nombre,
           public.graph_registry_funcion(s.projector)    as fn,
           21::smallint                                  as tipo,
           s.watch_columns                               as cols,
           public.graph_registry_args(s.entity_table)    as args
      from public.graph_sources s
     where s.enabled
    union all
    -- tgtype 8 = DELETE, de sentencia (sin el bit de fila).
    select s.entity_table,
           'trg_graph_' || s.entity_table || '_z_borrado',
           'graph_unproject_batch',
           8::smallint,
           '{}'::text[],
           '{}'::text[]
      from public.graph_sources s
     where s.enabled and s.delete_trigger
  )
  select e.tabla, e.nombre, 'el trigger que el registro declara no está instalado'
    from esperado e
   where not exists (select 1 from vivos v where v.tabla = e.tabla and v.nombre = e.nombre)

  union all
  select e.tabla, e.nombre,
         format('ejecuta %s y el registro dice %s', v.fn, e.fn)
    from esperado e join vivos v on v.tabla = e.tabla and v.nombre = e.nombre
   where v.fn is distinct from e.fn

  union all
  select e.tabla, e.nombre,
         format('los eventos instalados son tgtype=%s y el registro espera %s', v.tipo, e.tipo)
    from esperado e join vivos v on v.tabla = e.tabla and v.nombre = e.nombre
   where v.tipo is distinct from e.tipo

  union all
  select e.tabla, e.nombre,
         format('vigila {%s} y el registro declara {%s}',
                array_to_string(v.cols, ','), array_to_string(e.cols, ','))
    from esperado e join vivos v on v.tabla = e.tabla and v.nombre = e.nombre
   where v.cols is distinct from e.cols

  union all
  select e.tabla, e.nombre,
         format('recibe {%s} y el registro genera {%s}',
                array_to_string(v.args, ','), array_to_string(e.args, ','))
    from esperado e join vivos v on v.tabla = e.tabla and v.nombre = e.nombre
   where v.args is distinct from e.args

  -- Y al revés, que es la mitad que se olvida: un trigger de proyección sobre
  -- una tabla que el registro no menciona es exactamente la deriva que esto
  -- existe para detectar.
  union all
  select v.tabla, v.nombre, 'proyecta una tabla que el registro no declara'
    from vivos v
   where v.nombre like '%\_a\_nodo'
     and not exists (select 1 from public.graph_sources s
                      where s.enabled and s.entity_table = v.tabla)

  union all
  select v.tabla, v.nombre, 'borra nodos de una tabla que el registro no declara así'
    from vivos v
   where v.nombre like '%\_z\_borrado'
     and not exists (select 1 from public.graph_sources s
                      where s.enabled and s.delete_trigger and s.entity_table = v.tabla);
$fn$;

comment on function public.graph_registry_diff() is
  'Las diferencias entre lo que el registro declara y los triggers realmente instalados. Vacío = no hay deriva. Compara estructura (función, eventos, columnas, argumentos), no el texto de pg_get_triggerdef, para no atar la prueba al formato de una versión de Postgres. Ver 0057.';


-- =============================================================================
-- 8) LA DERIVA DE LOS DATOS — nodos que faltan y nodos que sobran
--
-- La guardia del §7 comprueba que los triggers estén donde deben. Esta
-- comprueba lo otro, que es lo que de verdad duele: que el RESULTADO siga
-- siendo cierto. Un trigger deshabilitado, una migración aplicada a medias o un
-- `copy` masivo dejan el grafo CORTO, y corto no se nota — `graph_impact`
-- contesta «nada depende de esto» con la misma seguridad que si fuera verdad.
--
-- Lee filas de todos los usuarios, así que NO se concede a `authenticated`: un
-- conteo por tabla ya diría cuánta gente hay y cuánto tiene cada cual. Es una
-- herramienta de operación y de CI.
-- =============================================================================

create or replace function public.graph_registry_deriva()
returns table (entity_table text, faltan bigint, sobran bigint)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $fn$
declare
  v       public.graph_sources%rowtype;
  v_filtro text;
  v_faltan bigint;
  v_sobran bigint;
begin
  for v in select * from public.graph_sources s where s.enabled order by s.entity_table loop
    -- `row_filter` se interpola tal cual, y se puede: el registro solo lo
    -- escriben las migraciones (§2 revoca la escritura a anon y authenticated),
    -- así que su nivel de confianza es el de una migración, no el de una
    -- entrada de usuario.
    v_filtro := case when v.row_filter is null then '' else ' and (' || v.row_filter || ')' end;

    execute format(
      'select count(*) from public.%I t where not exists (select 1 from public.graph_nodes n where n.entity_id = t.id)%s',
      v.entity_table, v_filtro
    ) into v_faltan;

    execute format(
      'select count(*) from public.graph_nodes n where n.entity_table = %L and not exists (select 1 from public.%I t where t.id = n.entity_id%s)',
      v.entity_table, v.entity_table, v_filtro
    ) into v_sobran;

    if v_faltan > 0 or v_sobran > 0 then
      entity_table := v.entity_table;
      faltan := v_faltan;
      sobran := v_sobran;
      return next;
    end if;
  end loop;
end;
$fn$;

comment on function public.graph_registry_deriva() is
  'Por cada fuente del registro: filas de negocio sin nodo, y nodos cuya fila ya no existe o ya no pasa el filtro. Vacío = la proyección sigue siendo cierta. Camina con row_security = off, así que NO se concede a authenticated. Ver 0057.';


-- =============================================================================
-- 9) EL BACKFILL — una sola definición, no dos
--
-- 0054 reconstruyó los nodos con catorce INSERT … SELECT escritos a mano, que
-- repetían la lista blanca de metadatos que ya estaba en el argumento del
-- trigger. Dos definiciones de lo mismo, y una prueba pgTAP dedicada a vigilar
-- que no divergieran.
--
-- Aquí no hay segunda definición: se vuelve a disparar la PRIMERA.
-- `update t set etiqueta = etiqueta` entra en la lista del `update of` —lo
-- garantiza el CHECK `graph_sources_etiqueta_vigilada`—, así que el proyector
-- corre con su propio código, y el `where … is distinct from` del `on conflict`
-- hace que las filas que ya estaban bien no se reescriban.
--
-- DOS COSAS QUE HAY QUE SABER ANTES DE CORRERLO:
--   · Reescribe todas las filas de la tabla (MVCC), y en `tasks`/`notes`
--     recalcula además el `tsvector` generado de 0039. Es coste de backfill,
--     una vez; conviene `set local lock_timeout` y, en tablas grandes, hacerlo
--     por lotes.
--   · Reconstruye NODOS, no aristas. Los triggers `_b_aristas` vigilan otras
--     columnas y este UPDATE no los despierta. Las aristas las reconstruirá el
--     milestone 2, cuando `graph_edge_rules` pase de describir a ejecutar.
-- =============================================================================

create or replace function public.graph_backfill_source(p_entity_table text)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $fn$
declare
  v public.graph_sources%rowtype;
  v_n bigint;
begin
  perform public.graph_registry_validar(p_entity_table);
  select * into v from public.graph_sources s where s.entity_table = p_entity_table;

  execute format('update public.%I set %I = %I', v.entity_table, v.label_column, v.label_column);
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

comment on function public.graph_backfill_source(text) is
  'Reconstruye los NODOS de una fuente volviendo a disparar su propio trigger. No hay una segunda definición del backfill que pueda divergir de la proyección: es la misma. Reescribe toda la tabla, así que es una operación de mantenimiento. Ver 0057 §9.';


-- =============================================================================
-- 10) LA COMPROBACIÓN, DENTRO DE LA PROPIA MIGRACIÓN
--
-- Aquí es donde esta migración se gana el derecho a existir. Valida las catorce
-- fuentes y exige que el registro describa EXACTAMENTE los triggers que 0054 y
-- 0056 dejaron instalados. Si la transcripción se desvía en una columna
-- vigilada o en un argumento, la migración aborta y no queda nada a medias.
--
-- Y NO RECREA NINGÚN TRIGGER: los compara. `create trigger` sobre `tasks` pide
-- ACCESS EXCLUSIVE, y un bloqueo pendiente encola detrás a todos los lectores
-- nuevos —el riesgo que 0054 documentó y contuvo con `lock_timeout`—. Volver a
-- crear treinta y siete triggers para dejarlos idénticos habría sido pagar una
-- ventana de bloqueo en producción a cambio de nada. Comparar demuestra lo
-- mismo y no toca una sola fila.
-- =============================================================================

do $$
declare
  v_tabla text;
  v_fallos text;
  v_n int;
begin
  for v_tabla in select entity_table from public.graph_sources order by 1 loop
    perform public.graph_registry_validar(v_tabla);
  end loop;

  select count(*),
         string_agg(format('  · %s / %s: %s', entity_table, trigger_name, motivo), e'\n' order by entity_table)
    into v_n, v_fallos
  from public.graph_registry_diff();

  if v_n > 0 then
    raise exception
      'graph: el registro sembrado en 0057 no describe los triggers instalados (% diferencia(s)):%s',
      v_n, e'\n' || v_fallos
      using errcode = 'P0001';
  end if;
end $$;


-- =============================================================================
-- 11) PERMISOS DE EJECUCIÓN
--
-- `0010_default_privileges.sql` concede EXECUTE a `anon` sobre toda función
-- nueva del esquema, así que todo lo de abajo se revoca a mano. Tres de estas
-- funciones no se conceden a NADIE más que al dueño: la que emite DDL, la que
-- escribe en tablas de negocio, y la que cuenta filas de todos los usuarios.
-- =============================================================================

revoke execute on function public.graph_registry_validar(text)  from public, anon;
revoke execute on function public.graph_registry_args(text)     from public, anon;
revoke execute on function public.graph_registry_funcion(text)  from public, anon;
revoke execute on function public.graph_registry_ddl(text)      from public, anon;
revoke execute on function public.graph_registry_diff()         from public, anon;

grant  execute on function public.graph_registry_validar(text)  to authenticated;
grant  execute on function public.graph_registry_args(text)     to authenticated;
grant  execute on function public.graph_registry_funcion(text)  to authenticated;
grant  execute on function public.graph_registry_ddl(text)      to authenticated;
grant  execute on function public.graph_registry_diff()         to authenticated;

-- Emite DDL, escribe tablas de negocio y cuenta filas ajenas, en ese orden.
-- Ninguna de las tres tiene por qué ser alcanzable desde una sesión de usuario.
revoke execute on function public.graph_install_source(text)    from public, anon, authenticated;
revoke execute on function public.graph_backfill_source(text)   from public, anon, authenticated;
revoke execute on function public.graph_registry_deriva()       from public, anon, authenticated;


-- =============================================================================
-- CÓMO SE REVIERTE
--
-- Sin ventana de inconsistencia y sin pérdida de datos, y no es una promesa:
-- es consecuencia de que el §10 compare en vez de instalar. El grafo NO
-- depende del registro para funcionar — los 37 triggers de 0054/0056 siguen
-- exactamente donde estaban.
--
--   drop function if exists public.graph_backfill_source(text);
--   drop function if exists public.graph_registry_deriva();
--   drop function if exists public.graph_registry_diff();
--   drop function if exists public.graph_install_source(text);
--   drop function if exists public.graph_registry_ddl(text);
--   drop function if exists public.graph_registry_funcion(text);
--   drop function if exists public.graph_registry_args(text);
--   drop function if exists public.graph_registry_validar(text);
--   drop table if exists public.graph_edge_rules;
--   drop table if exists public.graph_sources;
-- =============================================================================
